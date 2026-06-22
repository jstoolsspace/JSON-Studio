//! JSONL / NDJSON support.
//!
//! Session A provides record boundary detection so the host can recognize and
//! count records; the full virtualized table, per-row JSONPath and field stats
//! land in Session C (Phase 12).

use serde_json::Value;

use crate::model::{JsonlField, ParseError};
use crate::parse::build_index;

const CELL_PREVIEW: usize = 120;

/// A single record in a JSONL/NDJSON document.
#[derive(Debug, Clone)]
pub struct Record {
    /// 0-based record index.
    pub index: u32,
    pub byte_start: u32,
    pub byte_end: u32,
    /// `None` if the line parsed as valid JSON, otherwise the parse error.
    pub error: Option<ParseError>,
}

/// Split a JSONL/NDJSON document into records (one JSON value per non-empty
/// line) and validate each line. Blank lines are skipped.
pub fn split_records(bytes: &[u8]) -> Vec<Record> {
    let mut records = Vec::new();
    let mut index = 0u32;
    let mut line_start = 0usize;
    let mut i = 0usize;
    let len = bytes.len();
    while i <= len {
        let at_end = i == len;
        if at_end || bytes[i] == b'\n' {
            let mut end = i;
            // trim trailing \r
            if end > line_start && bytes[end - 1] == b'\r' {
                end -= 1;
            }
            let line = &bytes[line_start..end];
            let trimmed_non_empty = line.iter().any(|b| !b.is_ascii_whitespace());
            if trimmed_non_empty {
                let error = build_index(line).err();
                records.push(Record {
                    index,
                    byte_start: line_start as u32,
                    byte_end: end as u32,
                    error,
                });
                index += 1;
            }
            line_start = i + 1;
        }
        i += 1;
    }
    records
}

/// Collect the union of top-level object field names across the first `sample`
/// records, in first-seen order, with per-field record counts.
pub fn collect_fields(bytes: &[u8], records: &[Record], sample: usize) -> Vec<JsonlField> {
    let mut order: Vec<String> = Vec::new();
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for rec in records.iter().take(sample) {
        if rec.error.is_some() {
            continue;
        }
        let line = &bytes[rec.byte_start as usize..rec.byte_end as usize];
        if let Ok(Value::Object(map)) = serde_json::from_slice::<Value>(line) {
            for k in map.keys() {
                let e = counts.entry(k.clone()).or_insert(0);
                if *e == 0 {
                    order.push(k.clone());
                }
                *e += 1;
            }
        }
    }
    order
        .into_iter()
        .map(|name| {
            let count = counts.get(&name).copied().unwrap_or(0);
            JsonlField { name, count }
        })
        .collect()
}

/// Produce cell previews for a single record over the requested columns.
/// Returns (valid, cells).
pub fn record_cells(bytes: &[u8], rec: &Record, columns: &[String]) -> (bool, Vec<Option<String>>) {
    if rec.error.is_some() {
        return (false, vec![None; columns.len()]);
    }
    let line = &bytes[rec.byte_start as usize..rec.byte_end as usize];
    match serde_json::from_slice::<Value>(line) {
        Ok(value) => {
            let cells = columns
                .iter()
                .map(|c| value.get(c).map(cell_preview))
                .collect();
            (true, cells)
        }
        Err(_) => (false, vec![None; columns.len()]),
    }
}

fn cell_preview(v: &Value) -> String {
    let s = match v {
        Value::String(s) => s.clone(),
        Value::Object(m) => format!("{{ {} keys }}", m.len()),
        Value::Array(a) => format!("[ {} items ]", a.len()),
        _ => v.to_string(),
    };
    if s.chars().count() > CELL_PREVIEW {
        let mut t: String = s.chars().take(CELL_PREVIEW).collect();
        t.push('\u{2026}');
        t
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_fields_and_cells() {
        let s = "{\"a\":1,\"b\":\"x\"}\n{\"a\":2,\"c\":true}\n";
        let recs = split_records(s.as_bytes());
        let fields = collect_fields(s.as_bytes(), &recs, 100);
        let names: Vec<&str> = fields.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b", "c"]);
        assert_eq!(fields[0].count, 2); // a in both

        let cols = vec!["a".to_string(), "c".to_string()];
        let (valid, cells) = record_cells(s.as_bytes(), &recs[1], &cols);
        assert!(valid);
        assert_eq!(cells[0].as_deref(), Some("2"));
        assert_eq!(cells[1].as_deref(), Some("true"));
    }

    #[test]
    fn splits_and_validates() {
        let s = "{\"a\":1}\n{\"b\":2}\n\n{bad}\n";
        let recs = split_records(s.as_bytes());
        assert_eq!(recs.len(), 3);
        assert!(recs[0].error.is_none());
        assert!(recs[1].error.is_none());
        assert!(recs[2].error.is_some());
    }
}
