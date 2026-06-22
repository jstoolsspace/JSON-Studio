//! JSONPath query execution (RFC 9535 via `serde_json_path`).
//!
//! `serde_json_path` operates on a `serde_json::Value`, so for a query we build
//! a value once (lossless: `arbitrary_precision` + `preserve_order`) and map each
//! located result back to a node in our index via its JSON Pointer. That lets the
//! UI keep using lossless byte-span materialization for the results.
//!
//! Timing is left to the caller. For very large documents the host caps building
//! the value (an in-memory operation) and surfaces a clear error instead.

use serde_json::Value;
use serde_json_path::JsonPath;

use crate::index::DocumentIndex;
use crate::model::JsonNode;

/// Build a lossless `serde_json::Value` for querying.
pub fn parse_value(bytes: &[u8]) -> Result<Value, String> {
    serde_json::from_slice(bytes).map_err(|e| format!("could not parse document for query: {e}"))
}

/// Run a JSONPath query against a pre-built value, mapping results to nodes.
/// Returns (nodes, total_count, truncated).
pub fn run_query(
    index: &DocumentIndex,
    bytes: &[u8],
    value: &Value,
    expr: &str,
    limit: usize,
) -> Result<(Vec<JsonNode>, usize, bool), String> {
    let path = JsonPath::parse(expr).map_err(|e| format!("invalid JSONPath: {e}"))?;
    let located = path.query_located(value);
    let count = located.len();

    let mut nodes = Vec::new();
    for loc in located.into_iter() {
        if nodes.len() >= limit {
            break;
        }
        let pointer = loc.location().to_json_pointer();
        if let Some(id) = index.resolve_pointer(bytes, &pointer) {
            nodes.push(index.to_node(bytes, id));
        }
    }
    let truncated = count > nodes.len();
    Ok((nodes, count, truncated))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup(s: &str) -> (DocumentIndex, Value) {
        let d = DocumentIndex::build(s.as_bytes()).unwrap();
        let v = parse_value(s.as_bytes()).unwrap();
        (d, v)
    }

    #[test]
    fn simple_member_and_index() {
        let s = r#"{"a": {"b": [10, 20, 30]}}"#;
        let (d, v) = setup(s);
        let (nodes, count, _) = run_query(&d, s.as_bytes(), &v, "$.a.b[1]", 100).unwrap();
        assert_eq!(count, 1);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].preview, "20");
        assert_eq!(nodes[0].array_index, Some(1));
    }

    #[test]
    fn wildcard_and_mapping_back_to_nodes() {
        let s = r#"{"items": [{"id": 1}, {"id": 2}, {"id": 3}]}"#;
        let (d, v) = setup(s);
        let (nodes, count, _) = run_query(&d, s.as_bytes(), &v, "$.items[*].id", 100).unwrap();
        assert_eq!(count, 3);
        let previews: Vec<_> = nodes.iter().map(|n| n.preview.clone()).collect();
        assert_eq!(previews, vec!["1", "2", "3"]);
    }

    #[test]
    fn lossless_big_number_via_query() {
        let s = r#"{"id": 9223372036854775807}"#;
        let (d, v) = setup(s);
        let (nodes, _, _) = run_query(&d, s.as_bytes(), &v, "$.id", 10).unwrap();
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].preview, "9223372036854775807");
    }

    #[test]
    fn limit_truncates() {
        let s = r#"[1,2,3,4,5]"#;
        let (d, v) = setup(s);
        let (nodes, count, truncated) = run_query(&d, s.as_bytes(), &v, "$[*]", 3).unwrap();
        assert_eq!(count, 5);
        assert_eq!(nodes.len(), 3);
        assert!(truncated);
    }

    #[test]
    fn invalid_path_errors() {
        let s = r#"{"a": 1}"#;
        let (d, v) = setup(s);
        assert!(run_query(&d, s.as_bytes(), &v, "$.a[", 10).is_err());
    }
}
