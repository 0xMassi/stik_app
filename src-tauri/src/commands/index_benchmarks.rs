//! Opt-in, synthetic in-memory workloads; no user files or new dependencies.
//! Run with `STIK_PERF_SAMPLES=31 cargo test ... benchmark_note_index -- --ignored --nocapture`.

use super::{IndexedNote, NoteEntry, NoteIndex, SearchDocument};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::hint::black_box;
use std::time::Instant;

fn fixture(count: usize, bytes: usize, mixed_language: bool) -> NoteIndex {
    let index = NoteIndex::new();
    let mut entries = index.entries.lock().unwrap();
    for number in 0..count {
        let paragraph = if mixed_language && number % 10 == 0 {
            "Budget café, Équipe, İstanbul: riunione e prossime attività. 計画とメモ。\n"
        } else {
            "Budget review, meeting actions, research links, and next steps.\n"
        };
        let mut original = format!(
            "Capture {number:05}\n{}",
            paragraph.repeat(bytes / paragraph.len() + 1)
        );
        let end = super::floor_char_boundary(&original, bytes);
        original.truncate(end);
        if number == count - 1 {
            original.push_str("unique-zebra-needle");
        }
        let path = format!("/synthetic-vault/{number:05}.md");
        entries.insert(
            path.clone(),
            IndexedNote {
                entry: NoteEntry {
                    path,
                    filename: format!("{number:05}.md"),
                    folder: format!("Folder{}", number % 5),
                    title: format!("Capture {number:05}"),
                    preview: original[..super::floor_char_boundary(&original, 150)].to_string(),
                    created: format!("{number:08}"),
                    locked: false,
                },
                search: Some(SearchDocument {
                    normalized: original.to_lowercase(),
                    original,
                }),
            },
        );
    }
    drop(entries);
    index
}

fn measure<T>(label: &str, expected: usize, samples: usize, mut operation: impl FnMut() -> Vec<T>) {
    for _ in 0..3 {
        assert_eq!(black_box(operation()).len(), expected);
    }
    let mut milliseconds = Vec::with_capacity(samples);
    for _ in 0..samples {
        let start = Instant::now();
        let result = black_box(operation());
        milliseconds.push(start.elapsed().as_secs_f64() * 1_000.0);
        // Correctness checks and dropping the returned snapshot are not timed.
        assert_eq!(result.len(), expected);
    }
    let mut sorted = milliseconds.clone();
    sorted.sort_by(f64::total_cmp);
    println!(
        "PERF {}",
        serde_json::json!({
            "workload": label, "results": expected, "samples_ms": milliseconds,
            "p50_ms": sorted[samples / 2], "p95_ms": sorted[(samples * 95).div_ceil(100) - 1],
            "min_ms": sorted[0], "max_ms": sorted[samples - 1],
        })
    );
}

#[test]
#[ignore = "local performance measurement; run explicitly without other workloads"]
fn benchmark_note_index() {
    let samples: usize = std::env::var("STIK_PERF_SAMPLES")
        .unwrap_or_else(|_| "31".into())
        .parse()
        .unwrap();
    assert!(samples >= 5);
    let filter = std::env::var("STIK_PERF_CASE").unwrap_or_default();
    for (dataset, count, bytes, mixed_language) in [
        ("capture", 1_000, 512, false),
        ("large", 10_000, 4_096, true),
    ] {
        if !filter.is_empty() && !filter.starts_with(dataset) {
            continue;
        }
        let index = fixture(count, bytes, mixed_language);
        let cached_text_bytes: usize = index
            .entries
            .lock()
            .unwrap()
            .values()
            .map(|note| {
                let search = note.search.as_ref().unwrap();
                search.original.len() + search.normalized.len()
            })
            .sum();
        println!("DATASET {dataset}: notes={count}, target_bytes={bytes}, cached_text_bytes={cached_text_bytes}");
        for (name, query, folder, expected) in [
            ("common", "CAPTURE", None, count),
            ("rare", "unique-zebra-needle", None, 1),
            ("missing", "no-such-marker", None, 0),
            ("folder", "CAPTURE", Some("Folder2"), count / 5),
        ] {
            let label = format!("{dataset}/{name}");
            if !filter.is_empty() && filter != label {
                continue;
            }
            let results = index.search(query, folder).unwrap();
            let mut digest = DefaultHasher::new();
            for (entry, snippet) in &results {
                (
                    &entry.path,
                    &entry.filename,
                    &entry.folder,
                    &entry.title,
                    &entry.preview,
                    &entry.created,
                    entry.locked,
                    snippet,
                )
                    .hash(&mut digest);
            }
            println!("RESULT {label}: {:016x}", digest.finish());
            measure(&label, expected, samples, || {
                index.search(black_box(query), black_box(folder)).unwrap()
            });
        }
        let label = format!("{dataset}/list");
        if filter.is_empty() || filter == label {
            measure(&label, count, samples, || {
                index.list(black_box(None)).unwrap()
            });
        }
    }
}
