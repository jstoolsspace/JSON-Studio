//! `DocumentIndex`: the queryable structure built from a parse pass.
//!
//! Holds only the compact node records and the line table. Raw bytes live
//! outside (a memory-mapped file in the Tauri host) and are passed in to the
//! methods that need to materialize text, so the engine stays allocation-light
//! and reusable from wasm.

use std::collections::HashSet;

use crate::model::{
    DocumentMetadata, JsonNode, JsonPath, JsonPointer, NodePath, ParseError, ValueType,
};
use crate::parse::{build_index, NodeKey, NodeRecord, NO_PARENT};

/// Maximum characters in a node preview string.
pub const PREVIEW_LIMIT: usize = 200;

pub struct DocumentIndex {
    pub nodes: Vec<NodeRecord>,
    pub line_starts: Vec<u32>,
}

impl DocumentIndex {
    pub fn build(bytes: &[u8]) -> Result<Self, ParseError> {
        let data = build_index(bytes)?;
        Ok(DocumentIndex {
            nodes: data.nodes,
            line_starts: data.line_starts,
        })
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    pub fn line_count(&self) -> u32 {
        self.line_starts.len() as u32
    }

    /// Root node id (always 0 for a non-empty document).
    pub fn root(&self) -> Option<u32> {
        if self.nodes.is_empty() {
            None
        } else {
            Some(0)
        }
    }

    /// 1-based (line, column) for a byte offset.
    pub fn line_col(&self, byte: u32) -> (u32, u32) {
        let line_idx = match self.line_starts.binary_search(&byte) {
            Ok(i) => i,
            Err(i) => i.saturating_sub(1),
        };
        let line_start = self.line_starts[line_idx];
        (line_idx as u32 + 1, byte - line_start + 1)
    }

    /// Direct children ids of a node, in document order.
    pub fn children(&self, id: u32) -> Vec<u32> {
        let node = &self.nodes[id as usize];
        let mut out = Vec::with_capacity(node.child_count as usize);
        let mut i = id + 1;
        while i < node.subtree_end {
            out.push(i);
            i = self.nodes[i as usize].subtree_end;
        }
        out
    }

    /// Raw value text of a node (lossless).
    pub fn raw<'a>(&self, bytes: &'a [u8], id: u32) -> &'a str {
        let n = &self.nodes[id as usize];
        std::str::from_utf8(&bytes[n.value_start as usize..n.value_end as usize])
            .unwrap_or("\u{fffd}")
    }

    /// Decoded object-member key name, or None for array elements / root.
    pub fn key_name(&self, bytes: &[u8], id: u32) -> Option<String> {
        match self.nodes[id as usize].key {
            NodeKey::Member { key_start, key_end } => Some(decode_json_string(
                &bytes[key_start as usize..key_end as usize],
            )),
            _ => None,
        }
    }

    pub fn array_index(&self, id: u32) -> Option<u32> {
        match self.nodes[id as usize].key {
            NodeKey::Index(i) => Some(i),
            _ => None,
        }
    }

    /// Build the UI DTO for a node, with a truncated lossless preview.
    pub fn to_node(&self, bytes: &[u8], id: u32) -> JsonNode {
        let n = &self.nodes[id as usize];
        let (line, column) = self.line_col(n.value_start);
        JsonNode {
            id,
            parent_id: if n.parent == NO_PARENT {
                None
            } else {
                Some(n.parent)
            },
            key: self.key_name(bytes, id),
            array_index: self.array_index(id),
            value_type: n.kind,
            child_count: n.child_count,
            depth: n.depth,
            byte_start: n.value_start as u64,
            byte_end: n.value_end as u64,
            line,
            column,
            preview: self.preview(bytes, id),
        }
    }

    fn preview(&self, bytes: &[u8], id: u32) -> String {
        let n = &self.nodes[id as usize];
        match n.kind {
            ValueType::Object => {
                let c = n.child_count;
                format!("{{ {c} {} }}", if c == 1 { "key" } else { "keys" })
            }
            ValueType::Array => {
                let c = n.child_count;
                format!("[ {c} {} ]", if c == 1 { "item" } else { "items" })
            }
            _ => {
                let raw = self.raw(bytes, id);
                truncate_chars(raw, PREVIEW_LIMIT)
            }
        }
    }

    /// JSONPath + JSON Pointer identity for a node (computed on demand).
    pub fn node_path(&self, bytes: &[u8], id: u32) -> NodePath {
        // Walk to root collecting (key | index) segments.
        let mut chain: Vec<u32> = Vec::new();
        let mut cur = id;
        loop {
            let n = &self.nodes[cur as usize];
            chain.push(cur);
            if n.parent == NO_PARENT {
                break;
            }
            cur = n.parent;
        }
        chain.reverse(); // root .. id

        let mut path = String::from("$");
        let mut pointer = String::new();
        for &nid in chain.iter().skip(1) {
            // skip root itself
            match self.nodes[nid as usize].key {
                NodeKey::Index(i) => {
                    path.push_str(&format!("[{i}]"));
                    pointer.push('/');
                    pointer.push_str(&i.to_string());
                }
                NodeKey::Member { key_start, key_end } => {
                    let name =
                        decode_json_string(&bytes[key_start as usize..key_end as usize]);
                    if is_identifier(&name) {
                        path.push('.');
                        path.push_str(&name);
                    } else {
                        path.push_str("['");
                        path.push_str(&name.replace('\\', "\\\\").replace('\'', "\\'"));
                        path.push_str("']");
                    }
                    pointer.push('/');
                    pointer.push_str(&escape_pointer_token(&name));
                }
                NodeKey::Root => {}
            }
        }
        NodePath {
            path: JsonPath(path),
            pointer: JsonPointer(pointer),
        }
    }

    /// Flatten the visible tree (root + descendants of expanded containers) and
    /// return the node ids in `[offset, offset + limit)`, plus the total count
    /// of visible nodes. DFS in document order.
    pub fn visible_window(
        &self,
        expanded: &HashSet<u32>,
        offset: usize,
        limit: usize,
    ) -> (Vec<u32>, usize) {
        let mut out = Vec::new();
        let mut visible_count = 0usize;
        if self.nodes.is_empty() {
            return (out, 0);
        }
        // Explicit stack of node ids to visit, in reverse so we pop in order.
        let mut stack: Vec<u32> = vec![0];
        while let Some(id) = stack.pop() {
            let in_window = visible_count >= offset && out.len() < limit;
            if in_window {
                out.push(id);
            }
            visible_count += 1;
            let n = &self.nodes[id as usize];
            if n.kind.is_container() && expanded.contains(&id) {
                // push children reversed so leftmost is processed first
                let kids = self.children(id);
                for &c in kids.iter().rev() {
                    stack.push(c);
                }
            }
            // Early exit only safe if we no longer need the total count. We do
            // need the total for the scrollbar, so continue counting but stop
            // collecting once the window is full (cheap: no allocation).
        }
        (out, visible_count)
    }

    /// Text used when matching a node's *value* during search. Strings are
    /// decoded; number/boolean/null use their raw text; containers return None.
    pub fn value_match_text(&self, bytes: &[u8], id: u32) -> Option<String> {
        let n = &self.nodes[id as usize];
        match n.kind {
            ValueType::String => Some(decode_json_string(
                &bytes[n.value_start as usize..n.value_end as usize],
            )),
            ValueType::Number | ValueType::Boolean | ValueType::Null => {
                Some(self.raw(bytes, id).to_string())
            }
            ValueType::Object | ValueType::Array => None,
        }
    }

    /// 1-based source line of a node's value.
    pub fn node_line(&self, id: u32) -> u32 {
        self.line_col(self.nodes[id as usize].value_start).0
    }

    /// Resolve an RFC 6901 JSON Pointer to a node id, if it exists.
    pub fn resolve_pointer(&self, bytes: &[u8], pointer: &str) -> Option<u32> {
        if pointer.is_empty() {
            return self.root();
        }
        let mut cur = self.root()?;
        for raw_tok in pointer.split('/').skip(1) {
            let tok = raw_tok.replace("~1", "/").replace("~0", "~");
            let node = &self.nodes[cur as usize];
            match node.kind {
                ValueType::Array => {
                    let i: usize = tok.parse().ok()?;
                    let kids = self.children(cur);
                    cur = *kids.get(i)?;
                }
                ValueType::Object => {
                    let kids = self.children(cur);
                    let mut next = None;
                    for &c in &kids {
                        if self.key_name(bytes, c).as_deref() == Some(tok.as_str()) {
                            next = Some(c);
                            break;
                        }
                    }
                    cur = next?;
                }
                _ => return None,
            }
        }
        Some(cur)
    }

    pub fn metadata(
        &self,
        path: String,
        size_bytes: u64,
        encoding: String,
        format: crate::model::DocumentFormat,
    ) -> DocumentMetadata {
        DocumentMetadata {
            path,
            size_bytes,
            encoding,
            format,
            line_count: self.line_count(),
            node_count: self.nodes.len() as u32,
            modified_on_disk: false,
        }
    }
}

fn truncate_chars(s: &str, limit: usize) -> String {
    if s.chars().count() <= limit {
        s.to_string()
    } else {
        let mut out: String = s.chars().take(limit).collect();
        out.push('\u{2026}'); // …
        out
    }
}

/// Whether a member key can be written with dot notation in JSONPath.
fn is_identifier(s: &str) -> bool {
    let mut chars = s.chars();
    match chars.next() {
        Some(c) if c == '_' || c.is_ascii_alphabetic() => {}
        _ => return false,
    }
    chars.all(|c| c == '_' || c.is_ascii_alphanumeric())
}

fn escape_pointer_token(s: &str) -> String {
    s.replace('~', "~0").replace('/', "~1")
}

/// Decode a raw JSON string token (including surrounding quotes) into its
/// textual value. Used for display and path building only — the lossless raw
/// representation is always available via [`DocumentIndex::raw`].
pub fn decode_json_string(raw: &[u8]) -> String {
    // Strip the surrounding quotes if present.
    let inner = if raw.len() >= 2 && raw[0] == b'"' && raw[raw.len() - 1] == b'"' {
        &raw[1..raw.len() - 1]
    } else {
        raw
    };
    let s = std::str::from_utf8(inner).unwrap_or("\u{fffd}");
    if !s.contains('\\') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some('/') => out.push('/'),
            Some('b') => out.push('\u{0008}'),
            Some('f') => out.push('\u{000c}'),
            Some('n') => out.push('\n'),
            Some('r') => out.push('\r'),
            Some('t') => out.push('\t'),
            Some('u') => {
                let cp = take_hex4(&mut chars);
                if let Some(hi) = cp {
                    if (0xD800..=0xDBFF).contains(&hi) {
                        // surrogate pair
                        if chars.peek() == Some(&'\\') {
                            chars.next();
                            if chars.peek() == Some(&'u') {
                                chars.next();
                                if let Some(lo) = take_hex4(&mut chars) {
                                    let c = 0x10000
                                        + (((hi - 0xD800) as u32) << 10)
                                        + (lo - 0xDC00) as u32;
                                    if let Some(ch) = char::from_u32(c) {
                                        out.push(ch);
                                    }
                                }
                            }
                        }
                    } else if let Some(ch) = char::from_u32(hi as u32) {
                        out.push(ch);
                    }
                }
            }
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

fn take_hex4(chars: &mut std::iter::Peekable<std::str::Chars>) -> Option<u16> {
    let mut v: u16 = 0;
    for _ in 0..4 {
        let c = chars.next()?;
        let d = c.to_digit(16)?;
        v = v << 4 | d as u16;
    }
    Some(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn children_and_window() {
        let s = r#"{"a": 1, "b": [10, 20], "c": 3}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let root = 0u32;
        let kids = d.children(root);
        assert_eq!(kids.len(), 3);

        // Only root expanded -> 1 + 3 visible.
        let mut exp = HashSet::new();
        exp.insert(0);
        let (ids, total) = d.visible_window(&exp, 0, 100);
        assert_eq!(total, 4);
        assert_eq!(ids.len(), 4);

        // Expand the array too.
        let arr = kids[1];
        exp.insert(arr);
        let (_ids, total) = d.visible_window(&exp, 0, 100);
        assert_eq!(total, 6); // root + a + b + 10 + 20 + c
    }

    #[test]
    fn paths_and_pointers() {
        let s = r#"{"a": {"b c": [0, 1]}}"#;
        let bytes = s.as_bytes();
        let d = DocumentIndex::build(bytes).unwrap();
        // Find the element "1": last node.
        let last = (d.len() - 1) as u32;
        let np = d.node_path(bytes, last);
        assert_eq!(np.path.0, "$.a['b c'][1]");
        assert_eq!(np.pointer.0, "/a/b c/1");
    }

    #[test]
    fn pointer_escaping() {
        let s = r#"{"a/b": {"~x": 1}}"#;
        let bytes = s.as_bytes();
        let d = DocumentIndex::build(bytes).unwrap();
        let last = (d.len() - 1) as u32;
        let np = d.node_path(bytes, last);
        assert_eq!(np.pointer.0, "/a~1b/~0x");
    }

    #[test]
    fn decode_unicode_escape() {
        assert_eq!(decode_json_string(br#""aAb""#), "aAb");
        assert_eq!(decode_json_string(br#""tab\there""#), "tab\there");
    }

    #[test]
    fn window_offset() {
        let s = r#"[0,1,2,3,4,5,6,7,8,9]"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let mut exp = HashSet::new();
        exp.insert(0);
        let (ids, total) = d.visible_window(&exp, 3, 4);
        assert_eq!(total, 11); // array + 10 elements
        // offset 3 in visible order: root=0(idx0), then elems => visible[3] is element index 2
        assert_eq!(ids.len(), 4);
    }
}
