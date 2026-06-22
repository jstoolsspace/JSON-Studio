//! Streaming, lossless JSON indexer.
//!
//! This is intentionally a *byte-span indexer*, not a value parser. A single
//! pass over the bytes produces:
//!   * a flat, pre-order array of [`NodeRecord`]s, each holding the byte span of
//!     its raw value (never a parsed `f64`/`String`), and
//!   * a line-start index for O(log n) line/column lookup.
//!
//! Because values are kept as byte spans and materialized on demand, big
//! integers, full-precision decimals, key order and the exact source
//! representation are all preserved, and memory stays bounded (~tens of bytes
//! per node regardless of value size).
//!
//! The parser is iterative (explicit container stack) so deeply nested input
//! cannot overflow the call stack.

use crate::model::{ParseError, ValueType};

/// Identifies a node relative to its parent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeKey {
    Root,
    /// Array element with its index.
    Index(u32),
    /// Object member: byte span of the raw key token (including the quotes).
    Member { key_start: u32, key_end: u32 },
}

/// Compact, immutable record for a single JSON node. Offsets are `u32`
/// (documents are capped at 4 GiB).
#[derive(Debug, Clone, Copy)]
pub struct NodeRecord {
    pub kind: ValueType,
    pub key: NodeKey,
    /// Byte span of the raw value. For containers this runs from the opening
    /// bracket to (and including) the matching closing bracket.
    pub value_start: u32,
    pub value_end: u32,
    /// `u32::MAX` for the root.
    pub parent: u32,
    /// One past the index of the last descendant in pre-order (so the subtree
    /// is `[self_index, subtree_end)`). For scalars this is `self_index + 1`.
    pub subtree_end: u32,
    pub child_count: u32,
    pub depth: u32,
}

pub const NO_PARENT: u32 = u32::MAX;

/// Result of indexing: the node records plus the line-start table.
#[derive(Debug)]
pub struct IndexData {
    pub nodes: Vec<NodeRecord>,
    /// Byte offset of the start of each line (line 1 starts at byte 0).
    pub line_starts: Vec<u32>,
}

struct Frame {
    idx: u32,
    is_object: bool,
    count: u32,
}

struct Parser<'a> {
    b: &'a [u8],
    pos: usize,
    nodes: Vec<NodeRecord>,
    line_starts: Vec<u32>,
    stack: Vec<Frame>,
}

impl<'a> Parser<'a> {
    fn new(b: &'a [u8]) -> Self {
        Parser {
            b,
            pos: 0,
            nodes: Vec::new(),
            line_starts: vec![0],
            stack: Vec::new(),
        }
    }

    #[inline]
    fn err(&self, message: impl Into<String>) -> ParseError {
        self.err_at(self.pos, message)
    }

    fn err_at(&self, byte: usize, message: impl Into<String>) -> ParseError {
        // line = number of line starts <= byte; column = byte - line_start + 1
        let line_idx = match self.line_starts.binary_search(&(byte as u32)) {
            Ok(i) => i,
            Err(i) => i - 1,
        };
        let line_start = self.line_starts[line_idx] as usize;
        ParseError {
            message: message.into(),
            line: (line_idx + 1) as u32,
            column: (byte - line_start + 1) as u32,
            byte_offset: byte as u64,
        }
    }

    #[inline]
    fn peek(&self) -> Option<u8> {
        self.b.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while let Some(c) = self.b.get(self.pos).copied() {
            match c {
                b' ' | b'\t' | b'\r' => self.pos += 1,
                b'\n' => {
                    self.pos += 1;
                    self.line_starts.push(self.pos as u32);
                }
                _ => break,
            }
        }
    }

    /// Scan a string token starting at the opening quote. Returns the byte index
    /// just past the closing quote.
    fn scan_string(&mut self) -> Result<u32, ParseError> {
        debug_assert_eq!(self.b.get(self.pos).copied(), Some(b'"'));
        let start = self.pos;
        self.pos += 1; // opening quote
        loop {
            match self.b.get(self.pos).copied() {
                None => return Err(self.err_at(start, "unterminated string")),
                Some(b'"') => {
                    self.pos += 1;
                    return Ok(self.pos as u32);
                }
                Some(b'\\') => {
                    // Skip the escape introducer and the escaped byte. For \uXXXX
                    // the four hex digits are ordinary (non-quote) bytes and need
                    // no special handling here.
                    self.pos += 1;
                    if self.pos >= self.b.len() {
                        return Err(self.err_at(start, "unterminated escape in string"));
                    }
                    self.pos += 1;
                }
                Some(c) if c < 0x20 => {
                    return Err(self.err("control character must be escaped in string"));
                }
                Some(_) => self.pos += 1,
            }
        }
    }

    /// Scan a number token. Returns the byte index just past the last digit.
    fn scan_number(&mut self) -> Result<u32, ParseError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        // integer part
        match self.peek() {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => return Err(self.err_at(start, "invalid number")),
        }
        // fraction
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("invalid number: expected digit after '.'"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        // exponent
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("invalid number: expected digit in exponent"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        Ok(self.pos as u32)
    }

    fn expect_literal(&mut self, lit: &[u8], ty: &str) -> Result<u32, ParseError> {
        let start = self.pos;
        if self.b.len() >= start + lit.len() && &self.b[start..start + lit.len()] == lit {
            self.pos += lit.len();
            Ok(self.pos as u32)
        } else {
            Err(self.err_at(start, format!("invalid literal, expected `{ty}`")))
        }
    }

    /// Parse one value and attach it under `parent` with `key`. Opens (but does
    /// not close) containers by pushing a [`Frame`].
    fn parse_value(&mut self, parent: u32, key: NodeKey, depth: u32) -> Result<(), ParseError> {
        self.skip_ws();
        let start = self.pos as u32;
        let c = self.peek().ok_or_else(|| self.err("unexpected end of input"))?;
        let idx = self.nodes.len() as u32;
        match c {
            b'{' | b'[' => {
                let is_object = c == b'{';
                let kind = if is_object {
                    ValueType::Object
                } else {
                    ValueType::Array
                };
                self.nodes.push(NodeRecord {
                    kind,
                    key,
                    value_start: start,
                    value_end: 0, // filled at close
                    parent,
                    subtree_end: idx + 1, // updated at close
                    child_count: 0,       // updated at close
                    depth,
                });
                self.pos += 1;
                self.stack.push(Frame {
                    idx,
                    is_object,
                    count: 0,
                });
                Ok(())
            }
            b'"' => {
                let end = self.scan_string()?;
                self.push_scalar(ValueType::String, key, start, end, parent, depth);
                Ok(())
            }
            b't' => {
                let end = self.expect_literal(b"true", "true")?;
                self.push_scalar(ValueType::Boolean, key, start, end, parent, depth);
                Ok(())
            }
            b'f' => {
                let end = self.expect_literal(b"false", "false")?;
                self.push_scalar(ValueType::Boolean, key, start, end, parent, depth);
                Ok(())
            }
            b'n' => {
                let end = self.expect_literal(b"null", "null")?;
                self.push_scalar(ValueType::Null, key, start, end, parent, depth);
                Ok(())
            }
            b'-' | b'0'..=b'9' => {
                let end = self.scan_number()?;
                self.push_scalar(ValueType::Number, key, start, end, parent, depth);
                Ok(())
            }
            other => Err(self.err(format!("unexpected character `{}`", other as char))),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn push_scalar(
        &mut self,
        kind: ValueType,
        key: NodeKey,
        start: u32,
        end: u32,
        parent: u32,
        depth: u32,
    ) {
        let idx = self.nodes.len() as u32;
        self.nodes.push(NodeRecord {
            kind,
            key,
            value_start: start,
            value_end: end,
            parent,
            subtree_end: idx + 1,
            child_count: 0,
            depth,
        });
    }

    fn run(mut self) -> Result<IndexData, ParseError> {
        self.skip_ws();
        if self.pos >= self.b.len() {
            return Err(self.err("empty input"));
        }
        // Root value.
        self.parse_value(NO_PARENT, NodeKey::Root, 0)?;

        // Drive open containers to completion.
        while let Some(frame) = self.stack.last() {
            let is_object = frame.is_object;
            let container_idx = frame.idx as usize;
            let container_stack_pos = self.stack.len() - 1;
            let depth = self.stack.len() as u32; // children sit one level deeper

            self.skip_ws();
            let c = self
                .peek()
                .ok_or_else(|| self.err("unexpected end of input inside container"))?;

            // Close?
            let close = if is_object { b'}' } else { b']' };
            if c == close {
                let count = self.stack[container_stack_pos].count;
                self.pos += 1;
                self.nodes[container_idx].value_end = self.pos as u32;
                self.nodes[container_idx].child_count = count;
                self.nodes[container_idx].subtree_end = self.nodes.len() as u32;
                self.stack.pop();
                continue;
            }

            // Separator between elements.
            if self.stack[container_stack_pos].count > 0 {
                if c != b',' {
                    return Err(self.err(format!(
                        "expected `,` or `{}`",
                        close as char
                    )));
                }
                self.pos += 1;
                self.skip_ws();
            }

            if is_object {
                // Member key.
                let kc = self.peek().ok_or_else(|| self.err("expected object key"))?;
                if kc != b'"' {
                    return Err(self.err("expected string key"));
                }
                let key_start = self.pos as u32;
                let key_end = self.scan_string()?;
                self.skip_ws();
                if self.peek() != Some(b':') {
                    return Err(self.err("expected `:` after object key"));
                }
                self.pos += 1;
                let key = NodeKey::Member { key_start, key_end };
                self.parse_value(container_idx as u32, key, depth)?;
            } else {
                let index = self.stack[container_stack_pos].count;
                self.parse_value(container_idx as u32, NodeKey::Index(index), depth)?;
            }
            self.stack[container_stack_pos].count += 1;
        }

        // No trailing content (use jsonl module for multi-document inputs).
        self.skip_ws();
        if self.pos != self.b.len() {
            return Err(self.err("trailing characters after top-level value"));
        }

        Ok(IndexData {
            nodes: self.nodes,
            line_starts: self.line_starts,
        })
    }
}

/// Build the lossless node index for a single JSON document.
pub fn build_index(bytes: &[u8]) -> Result<IndexData, ParseError> {
    Parser::new(bytes).run()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idx(s: &str) -> IndexData {
        build_index(s.as_bytes()).expect("should parse")
    }

    fn raw<'a>(s: &'a str, n: &NodeRecord) -> &'a str {
        &s[n.value_start as usize..n.value_end as usize]
    }

    #[test]
    fn preserves_big_integer_verbatim() {
        let s = r#"{"id": 9223372036854775807}"#;
        let d = idx(s);
        // node 0 = object, node 1 = the number
        assert_eq!(d.nodes[1].kind, ValueType::Number);
        assert_eq!(raw(s, &d.nodes[1]), "9223372036854775807");
    }

    #[test]
    fn preserves_high_precision_decimal() {
        let s = r#"{"price": 0.1234567890123456789}"#;
        let d = idx(s);
        assert_eq!(raw(s, &d.nodes[1]), "0.1234567890123456789");
    }

    #[test]
    fn preserves_object_key_order_including_numeric_like_keys() {
        let s = r#"{"2": "second", "1": "first"}"#;
        let d = idx(s);
        // Member keys, in document order.
        let keys: Vec<&str> = d
            .nodes
            .iter()
            .filter_map(|n| match n.key {
                NodeKey::Member { key_start, key_end } => {
                    Some(&s[key_start as usize..key_end as usize])
                }
                _ => None,
            })
            .collect();
        assert_eq!(keys, vec![r#""2""#, r#""1""#]);
    }

    #[test]
    fn subtree_and_child_counts_are_correct() {
        let s = r#"{"a": [1, 2, {"b": true}], "c": null}"#;
        let d = idx(s);
        // root object has 2 members
        assert_eq!(d.nodes[0].kind, ValueType::Object);
        assert_eq!(d.nodes[0].child_count, 2);
        assert_eq!(d.nodes[0].subtree_end, d.nodes.len() as u32);
        // find the array
        let arr = d.nodes.iter().find(|n| n.kind == ValueType::Array).unwrap();
        assert_eq!(arr.child_count, 3);
    }

    #[test]
    fn full_combined_example_is_lossless() {
        let s = r#"{
  "id": 9223372036854775807,
  "price": 0.1234567890123456789,
  "2": "second",
  "1": "first"
}"#;
        let d = idx(s);
        assert_eq!(d.nodes[0].kind, ValueType::Object);
        assert_eq!(d.nodes[0].child_count, 4);
        // Each member value raw text is exactly as written.
        assert_eq!(raw(s, &d.nodes[1]), "9223372036854775807");
        assert_eq!(raw(s, &d.nodes[2]), "0.1234567890123456789");
        assert_eq!(raw(s, &d.nodes[3]), r#""second""#);
        assert_eq!(raw(s, &d.nodes[4]), r#""first""#);
    }

    #[test]
    fn reports_error_location() {
        let s = "{\n  \"a\": ,\n}";
        let e = build_index(s.as_bytes()).unwrap_err();
        assert_eq!(e.line, 2);
        assert!(e.column > 1);
    }

    #[test]
    fn rejects_trailing_comma() {
        assert!(build_index(b"[1, 2, ]").is_err());
        assert!(build_index(br#"{"a": 1,}"#).is_err());
    }

    #[test]
    fn rejects_trailing_content() {
        assert!(build_index(b"{} {}").is_err());
    }

    #[test]
    fn empty_input_errors() {
        assert!(build_index(b"   ").is_err());
    }

    #[test]
    fn deeply_nested_does_not_overflow() {
        let depth = 50_000;
        let mut s = String::with_capacity(depth * 2);
        for _ in 0..depth {
            s.push('[');
        }
        for _ in 0..depth {
            s.push(']');
        }
        let d = build_index(s.as_bytes()).expect("deeply nested ok");
        assert_eq!(d.nodes.len(), depth);
        assert_eq!(d.nodes[0].depth, 0);
        assert_eq!(d.nodes[depth - 1].depth, (depth - 1) as u32);
    }

    #[test]
    fn handles_escaped_quotes_in_strings_and_keys() {
        let s = r#"{"a\"b": "x\"y"}"#;
        let d = idx(s);
        assert_eq!(d.nodes[0].child_count, 1);
        assert_eq!(raw(s, &d.nodes[1]), r#""x\"y""#);
    }
}
