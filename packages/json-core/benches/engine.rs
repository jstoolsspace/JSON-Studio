//! Criterion benchmarks for the json-core engine.
//!
//! Run with: `cargo bench -p json-core`
//!
//! These exercise the in-memory engine on moderate sizes (≈1–5 MB) so the suite
//! finishes quickly. Very large files (100/500 MB), the 1M-element array, and
//! 1M-line JSONL are validated through the app using `scripts/gen-fixtures.mjs`
//! (see PERFORMANCE.md) rather than criterion, which would iterate them too
//! many times.

use std::collections::HashSet;

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};

use json_core::diff::diff_values;
use json_core::model::{ArrayMode, SearchOptions};
use json_core::parse::build_index;
use json_core::query;
use json_core::search::search;
use json_core::DocumentIndex;

/// Array of representative user objects. `salt` perturbs a field so two datasets
/// differ for the diff benchmark.
fn gen_records(n: usize, salt: usize) -> String {
    let mut s = String::with_capacity(n * 160);
    s.push('[');
    for i in 0..n {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!(
            r#"{{"id":{i},"name":"user {i}","email":"user{i}@example.test","active":{active},"score":{score},"tags":["a","b","c"],"profile":{{"age":{age},"city":"town{i}"}}}}"#,
            active = i % 2 == 0,
            score = (i + salt) % 1000,
            age = 20 + (i % 50),
        ));
    }
    s.push(']');
    s
}

fn gen_deep(depth: usize) -> String {
    let mut s = String::with_capacity(depth * 2 + 1);
    for _ in 0..depth {
        s.push('[');
    }
    s.push('0');
    for _ in 0..depth {
        s.push(']');
    }
    s
}

fn gen_num_array(n: usize) -> String {
    let mut s = String::with_capacity(n * 7);
    s.push('[');
    for i in 0..n {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&i.to_string());
    }
    s.push(']');
    s
}

fn opts(query: &str, keys: bool, values: bool, regex: bool) -> SearchOptions {
    SearchOptions {
        query: query.to_string(),
        in_keys: keys,
        in_values: values,
        case_sensitive: false,
        exact: false,
        regex,
        subtree_root: None,
        limit: 1_000_000,
    }
}

fn benches(c: &mut Criterion) {
    let d1 = gen_records(7_000, 0); // ≈1 MB
    let d5 = gen_records(35_000, 0); // ≈5 MB
    let d1b = gen_records(7_000, 1);
    let deep = gen_deep(10_000);
    let arr = gen_num_array(100_000);

    // --- Parse / index ---
    {
        let mut g = c.benchmark_group("parse");
        g.throughput(Throughput::Bytes(d1.len() as u64));
        g.bench_function("records_1mb", |b| {
            b.iter(|| build_index(black_box(d1.as_bytes())).unwrap())
        });
        g.throughput(Throughput::Bytes(d5.len() as u64));
        g.bench_function("records_5mb", |b| {
            b.iter(|| build_index(black_box(d5.as_bytes())).unwrap())
        });
        g.throughput(Throughput::Bytes(arr.len() as u64));
        g.bench_function("num_array_100k", |b| {
            b.iter(|| build_index(black_box(arr.as_bytes())).unwrap())
        });
        g.throughput(Throughput::Bytes(deep.len() as u64));
        g.bench_function("deep_10k", |b| {
            b.iter(|| build_index(black_box(deep.as_bytes())).unwrap())
        });
        g.finish();
    }

    let idx = DocumentIndex::build(d1.as_bytes()).unwrap();

    // --- Navigation ---
    {
        let mut exp = HashSet::new();
        for (i, n) in idx.nodes.iter().enumerate() {
            if n.kind.is_container() {
                exp.insert(i as u32);
            }
        }
        c.bench_function("navigate/visible_window_100", |b| {
            b.iter(|| idx.visible_window(black_box(&exp), 0, 100))
        });
    }

    // --- Search ---
    {
        let keys = opts("name", true, false, false);
        c.bench_function("search/keys", |b| {
            b.iter(|| search(&idx, d1.as_bytes(), black_box(&keys)).unwrap())
        });
        let re = opts(r"user \d+", false, true, true);
        c.bench_function("search/regex_values", |b| {
            b.iter(|| search(&idx, d1.as_bytes(), black_box(&re)).unwrap())
        });
    }

    // --- Query ---
    {
        c.bench_function("query/parse_value_1mb", |b| {
            b.iter(|| query::parse_value(black_box(d1.as_bytes())).unwrap())
        });
        let val = query::parse_value(d1.as_bytes()).unwrap();
        c.bench_function("query/run_$[*].id", |b| {
            b.iter(|| {
                query::run_query(&idx, d1.as_bytes(), black_box(&val), "$[*].id", 1_000_000)
                    .unwrap()
            })
        });
    }

    // --- Diff ---
    {
        let va = query::parse_value(d1.as_bytes()).unwrap();
        let vb = query::parse_value(d1b.as_bytes()).unwrap();
        c.bench_function("diff/by_index_1mb", |b| {
            b.iter(|| {
                diff_values(
                    black_box(&va),
                    black_box(&vb),
                    &ArrayMode::ByIndex,
                    1_000_000,
                )
            })
        });
    }
}

criterion_group!(engine, benches);
criterion_main!(engine);
