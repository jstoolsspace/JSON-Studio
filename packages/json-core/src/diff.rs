//! Structural JSON diff over `serde_json::Value`.
//!
//! Compares by structure, not text: object keys are matched by name (order
//! ignored), and arrays are matched per [`ArrayMode`] — by index, or by a shared
//! key field. Each entry carries a separate left/right JSON Pointer because
//! match-by-key can pair elements that sit at different array indices; the host
//! resolves those pointers to source lines.

use std::collections::HashMap;

use serde_json::Value;

use crate::model::{ArrayMode, ChangeKind, DiffEntry, DiffResult, DiffSummary};

const PREVIEW: usize = 140;

pub fn diff_values(left: &Value, right: &Value, mode: &ArrayMode, limit: usize) -> DiffResult {
    let mut out = Vec::new();
    let mut truncated = false;
    diff_node(left, right, "", "", mode, limit, &mut out, &mut truncated);

    let mut summary = DiffSummary::default();
    for e in &out {
        match e.kind {
            ChangeKind::Added => summary.added += 1,
            ChangeKind::Removed => summary.removed += 1,
            ChangeKind::Changed => summary.changed += 1,
        }
    }
    DiffResult {
        entries: out,
        summary,
        truncated,
    }
}

#[allow(clippy::too_many_arguments)]
fn diff_node(
    l: &Value,
    r: &Value,
    lptr: &str,
    rptr: &str,
    mode: &ArrayMode,
    limit: usize,
    out: &mut Vec<DiffEntry>,
    truncated: &mut bool,
) {
    if out.len() >= limit {
        *truncated = true;
        return;
    }
    match (l, r) {
        (Value::Object(a), Value::Object(b)) => {
            for (k, lv) in a {
                if cap(out, limit, truncated) {
                    return;
                }
                let lk = format!("{lptr}/{}", esc(k));
                let rk = format!("{rptr}/{}", esc(k));
                match b.get(k) {
                    Some(rv) => diff_node(lv, rv, &lk, &rk, mode, limit, out, truncated),
                    None => out.push(removed(&lk, lv)),
                }
            }
            for (k, rv) in b {
                if cap(out, limit, truncated) {
                    return;
                }
                if !a.contains_key(k) {
                    let rk = format!("{rptr}/{}", esc(k));
                    out.push(added(&rk, rv));
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            array_diff(a, b, lptr, rptr, mode, limit, out, truncated)
        }
        (lv, rv) => {
            if lv != rv {
                out.push(changed(lptr, rptr, lv, rv));
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn array_diff(
    a: &[Value],
    b: &[Value],
    lptr: &str,
    rptr: &str,
    mode: &ArrayMode,
    limit: usize,
    out: &mut Vec<DiffEntry>,
    truncated: &mut bool,
) {
    match mode {
        ArrayMode::ByIndex => {
            let n = a.len().max(b.len());
            for i in 0..n {
                if cap(out, limit, truncated) {
                    return;
                }
                let lk = format!("{lptr}/{i}");
                let rk = format!("{rptr}/{i}");
                match (a.get(i), b.get(i)) {
                    (Some(lv), Some(rv)) => {
                        diff_node(lv, rv, &lk, &rk, mode, limit, out, truncated)
                    }
                    (Some(lv), None) => out.push(removed(&lk, lv)),
                    (None, Some(rv)) => out.push(added(&rk, rv)),
                    (None, None) => {}
                }
            }
        }
        ArrayMode::ByKey { key } => {
            let rmap: HashMap<String, usize> = b
                .iter()
                .enumerate()
                .filter_map(|(i, e)| key_of(e, key).map(|k| (k, i)))
                .collect();
            let mut matched_right: Vec<bool> = vec![false; b.len()];

            for (li, lv) in a.iter().enumerate() {
                if cap(out, limit, truncated) {
                    return;
                }
                let lk = format!("{lptr}/{li}");
                match key_of(lv, key).and_then(|k| rmap.get(&k).copied()) {
                    Some(ri) => {
                        matched_right[ri] = true;
                        let rk = format!("{rptr}/{ri}");
                        diff_node(lv, &b[ri], &lk, &rk, mode, limit, out, truncated);
                    }
                    None => out.push(removed(&lk, lv)),
                }
            }
            for (ri, rv) in b.iter().enumerate() {
                if cap(out, limit, truncated) {
                    return;
                }
                if !matched_right[ri] {
                    let rk = format!("{rptr}/{ri}");
                    out.push(added(&rk, rv));
                }
            }
        }
    }
}

fn cap(out: &[DiffEntry], limit: usize, truncated: &mut bool) -> bool {
    if out.len() >= limit {
        *truncated = true;
        true
    } else {
        false
    }
}

fn key_of(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

fn disp(ptr: &str) -> String {
    if ptr.is_empty() {
        "$".to_string()
    } else {
        ptr.to_string()
    }
}

fn preview(v: &Value) -> String {
    let s = match v {
        Value::Object(m) => format!("{{ {} keys }}", m.len()),
        Value::Array(a) => format!("[ {} items ]", a.len()),
        _ => v.to_string(),
    };
    if s.chars().count() > PREVIEW {
        let mut t: String = s.chars().take(PREVIEW).collect();
        t.push('\u{2026}');
        t
    } else {
        s
    }
}

fn removed(lptr: &str, lv: &Value) -> DiffEntry {
    DiffEntry {
        kind: ChangeKind::Removed,
        path: disp(lptr),
        left_pointer: Some(lptr.to_string()),
        right_pointer: None,
        left: Some(preview(lv)),
        right: None,
        left_line: None,
        right_line: None,
    }
}

fn added(rptr: &str, rv: &Value) -> DiffEntry {
    DiffEntry {
        kind: ChangeKind::Added,
        path: disp(rptr),
        left_pointer: None,
        right_pointer: Some(rptr.to_string()),
        left: None,
        right: Some(preview(rv)),
        left_line: None,
        right_line: None,
    }
}

fn changed(lptr: &str, rptr: &str, lv: &Value, rv: &Value) -> DiffEntry {
    DiffEntry {
        kind: ChangeKind::Changed,
        path: disp(lptr),
        left_pointer: Some(lptr.to_string()),
        right_pointer: Some(rptr.to_string()),
        left: Some(preview(lv)),
        right: Some(preview(rv)),
        left_line: None,
        right_line: None,
    }
}

fn esc(k: &str) -> String {
    k.replace('~', "~0").replace('/', "~1")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_added_removed_changed() {
        let l = json!({"a": 1, "b": 2, "obj": {"x": 1}});
        let r = json!({"a": 1, "b": 3, "c": 4, "obj": {"x": 1}});
        let d = diff_values(&l, &r, &ArrayMode::ByIndex, 1000);
        assert_eq!(d.summary.changed, 1); // b
        assert_eq!(d.summary.added, 1); // c
        assert_eq!(d.summary.removed, 0);
        let changed = d
            .entries
            .iter()
            .find(|e| e.kind == ChangeKind::Changed)
            .unwrap();
        assert_eq!(changed.path, "/b");
        assert_eq!(changed.left.as_deref(), Some("2"));
        assert_eq!(changed.right.as_deref(), Some("3"));
    }

    #[test]
    fn ignores_object_key_order() {
        let l = json!({"a": 1, "b": 2});
        let r = json!({"b": 2, "a": 1});
        let d = diff_values(&l, &r, &ArrayMode::ByIndex, 1000);
        assert_eq!(d.entries.len(), 0);
    }

    #[test]
    fn array_by_index() {
        let l = json!([1, 2, 3]);
        let r = json!([1, 9, 3, 4]);
        let d = diff_values(&l, &r, &ArrayMode::ByIndex, 1000);
        assert_eq!(d.summary.changed, 1); // index 1
        assert_eq!(d.summary.added, 1); // index 3
    }

    #[test]
    fn array_by_key_matches_across_positions() {
        let l = json!([{"id": "a", "v": 1}, {"id": "b", "v": 2}]);
        let r = json!([{"id": "b", "v": 2}, {"id": "a", "v": 99}]);
        // By index this would be two changes; by key only "a".v changes.
        let d = diff_values(&l, &r, &ArrayMode::ByKey { key: "id".into() }, 1000);
        assert_eq!(d.summary.changed, 1);
        let e = &d.entries[0];
        assert_eq!(e.left_pointer.as_deref(), Some("/0/v"));
        assert_eq!(e.right_pointer.as_deref(), Some("/1/v"));
    }

    #[test]
    fn by_key_added_removed() {
        let l = json!([{"id": "a"}, {"id": "b"}]);
        let r = json!([{"id": "a"}, {"id": "c"}]);
        let d = diff_values(&l, &r, &ArrayMode::ByKey { key: "id".into() }, 1000);
        assert_eq!(d.summary.removed, 1); // b
        assert_eq!(d.summary.added, 1); // c
    }

    #[test]
    fn lossless_number_change() {
        let l: Value = serde_json::from_str(r#"{"n": 9223372036854775807}"#).unwrap();
        let r: Value = serde_json::from_str(r#"{"n": 9223372036854775806}"#).unwrap();
        let d = diff_values(&l, &r, &ArrayMode::ByIndex, 1000);
        assert_eq!(d.summary.changed, 1);
        assert_eq!(d.entries[0].left.as_deref(), Some("9223372036854775807"));
    }
}
