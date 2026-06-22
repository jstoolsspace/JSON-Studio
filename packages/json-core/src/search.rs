//! Search over the node index: keys, values, exact/substring, case sensitivity,
//! regular expressions, and optional subtree scoping.
//!
//! Operates on the compact index + raw bytes — no full value tree required.
//! Timing is left to the caller (the host fills `SearchOutcome::duration_ms`).

use regex::{Regex, RegexBuilder};

use crate::index::DocumentIndex;
use crate::model::{MatchKind, SearchOptions, SearchResult};

enum Matcher {
    Regex(Regex),
    /// (needle, case_sensitive, exact)
    Plain(String, bool, bool),
}

impl Matcher {
    fn build(opts: &SearchOptions) -> Result<Matcher, String> {
        if opts.regex {
            let re = RegexBuilder::new(&opts.query)
                .case_insensitive(!opts.case_sensitive)
                .build()
                .map_err(|e| format!("invalid regular expression: {e}"))?;
            Ok(Matcher::Regex(re))
        } else {
            let needle = if opts.case_sensitive {
                opts.query.clone()
            } else {
                opts.query.to_lowercase()
            };
            Ok(Matcher::Plain(needle, opts.case_sensitive, opts.exact))
        }
    }

    fn is_match(&self, hay: &str) -> bool {
        match self {
            Matcher::Regex(re) => re.is_match(hay),
            Matcher::Plain(needle, case_sensitive, exact) => {
                if *case_sensitive {
                    if *exact {
                        hay == needle
                    } else {
                        hay.contains(needle.as_str())
                    }
                } else {
                    let h = hay.to_lowercase();
                    if *exact {
                        h == *needle
                    } else {
                        h.contains(needle.as_str())
                    }
                }
            }
        }
    }
}

/// Run a search, returning matches (capped at `opts.limit`) and whether the
/// result set was truncated.
pub fn search(
    index: &DocumentIndex,
    bytes: &[u8],
    opts: &SearchOptions,
) -> Result<(Vec<SearchResult>, bool), String> {
    if opts.query.is_empty() {
        return Ok((Vec::new(), false));
    }
    let matcher = Matcher::build(opts)?;

    // Determine the node id range to scan.
    let (start, end) = match opts.subtree_root {
        Some(root) if (root as usize) < index.len() => {
            (root, index.nodes[root as usize].subtree_end)
        }
        _ => (0u32, index.len() as u32),
    };

    let mut results = Vec::new();
    let mut truncated = false;

    for id in start..end {
        // Key match (object members only).
        if opts.in_keys {
            if let Some(key) = index.key_name(bytes, id) {
                if matcher.is_match(&key) {
                    if results.len() >= opts.limit {
                        truncated = true;
                        break;
                    }
                    results.push(make_result(index, bytes, id, MatchKind::Key));
                }
            }
        }
        // Value match (scalars only).
        if opts.in_values {
            if let Some(text) = index.value_match_text(bytes, id) {
                if matcher.is_match(&text) {
                    if results.len() >= opts.limit {
                        truncated = true;
                        break;
                    }
                    results.push(make_result(index, bytes, id, MatchKind::Value));
                }
            }
        }
    }

    Ok((results, truncated))
}

fn make_result(index: &DocumentIndex, bytes: &[u8], id: u32, kind: MatchKind) -> SearchResult {
    let node = index.to_node(bytes, id);
    let np = index.node_path(bytes, id);
    SearchResult {
        node_id: id,
        path: np.path,
        pointer: np.pointer,
        value_type: node.value_type,
        preview: node.preview,
        line: node.line,
        match_kind: kind,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(q: &str) -> SearchOptions {
        SearchOptions {
            query: q.to_string(),
            in_keys: true,
            in_values: true,
            case_sensitive: false,
            exact: false,
            regex: false,
            subtree_root: None,
            limit: 1000,
        }
    }

    #[test]
    fn matches_keys_and_values() {
        let s = r#"{"name": "Alice", "city": "Wonderland", "age": 30}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let (r, _) = search(&d, s.as_bytes(), &opts("name")).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].match_kind, MatchKind::Key);

        let (r, _) = search(&d, s.as_bytes(), &opts("alice")).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].match_kind, MatchKind::Value);
    }

    #[test]
    fn case_sensitivity_and_exact() {
        let s = r#"{"a": "Hello", "b": "hello world"}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();

        let mut o = opts("hello");
        o.case_sensitive = true;
        let (r, _) = search(&d, s.as_bytes(), &o).unwrap();
        assert_eq!(r.len(), 1); // only "hello world"

        let mut o = opts("hello world");
        o.exact = true;
        let (r, _) = search(&d, s.as_bytes(), &o).unwrap();
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn regex_and_values_only() {
        let s = r#"{"x": "abc123", "y": "no digits"}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let mut o = opts(r"\d+");
        o.regex = true;
        o.in_keys = false;
        let (r, _) = search(&d, s.as_bytes(), &o).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].value_type, crate::model::ValueType::String);
    }

    #[test]
    fn subtree_scope_and_limit() {
        let s = r#"{"a": {"k": 1}, "b": {"k": 2}}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        // scope to subtree "a"
        let a = d.children(0)[0];
        let mut o = opts("k");
        o.subtree_root = Some(a);
        let (r, _) = search(&d, s.as_bytes(), &o).unwrap();
        assert_eq!(r.len(), 1);

        let mut o = opts("k");
        o.limit = 1;
        let (r, trunc) = search(&d, s.as_bytes(), &o).unwrap();
        assert_eq!(r.len(), 1);
        assert!(trunc);
    }

    #[test]
    fn invalid_regex_errors() {
        let s = r#"{"a": 1}"#;
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let mut o = opts("(");
        o.regex = true;
        assert!(search(&d, s.as_bytes(), &o).is_err());
    }
}
