# Measured note-search improvement — 2026-09-05

## Result and scope

Reusing the note index's existing lowercase text reduced median common-query search time from **23.58 ms to 3.83 ms (83.8%)** on a synthetic 10,000-note vault. The production change is confined to `src-tauri/src/commands/index.rs`; it adds no dependency or persistent cache and does not change the public API.

These are local, warmed, synchronous Rust index timings on an Apple M4 Max, **not end-to-end UI latency or a whole-application speedup**. The work measured indexed search and note listing. It did not benchmark startup, editor rendering, iCloud, semantic search, or GPU activity.

Revision boundaries:

- Production starting point: `b8daf5c` (the completed Bun migration).
- Reproducible baseline with the opt-in benchmark: `c61901a`.
- Kept optimization and correctness tests: `4347d5d60cbf1dad0e35e92f5750b63f9c148139`.
- Work stayed on `codex/slop-cleanup` in an isolated worktree. Existing `main` work and `develop` were not merged, reset, or overwritten. No remote write was performed.

## Why this flow

Repository tracing identified an interactive shared path:

- `src/components/CommandPalette.tsx` invokes `search_notes` after a 200 ms debounce, alongside `semantic_search`.
- `src/components/EditorWindow.tsx` uses the same indexed search for browsing notes.
- `src/components/Editor.tsx` uses it for wiki-link lookup.
- `src-tauri/src/commands/notes.rs::search_notes` rejects blank queries and dispatches `NoteIndex::search` through `spawn_blocking`.
- `NoteIndex::list` also feeds browsing and embedding construction; it was measured as an unchanged comparison workload.

The existing smoke test covers a single rare match in 10,000 short notes, but not common matches in longer documents. The new benchmark exercises both successful and unsuccessful queries and a folder filter, using the actual index implementation rather than mocks.

An exploratory CPU sample of the synthetic process attributed substantial time to snippet generation's `to_lowercase`. Source inspection confirmed that every matching note was lowercased again even though its normalized content was already cached. That exploratory binary had optimized application code but debug dependencies, so its timings were excluded from the final table. Both final binaries use the full release profile, including optimized dependencies.

## Workload and environment

| Property | Recorded value |
| --- | --- |
| Hardware | Apple M4 Max, 36 GiB RAM |
| OS | macOS 27.0, build 26A5421a |
| Rust | 1.98.0, `88d9e12ae`, 2026-08-18 |
| Target | `aarch64-apple-darwin` |
| Build | `--release --lib --all-features --locked --offline`; repository `opt-level="s"`, LTO, one codegen unit |
| Frontend verification | Bun 1.4.1, Node 20.20.2; existing Vitest runner retained |
| Swift build tools | Xcode 26.6, build 17F113 |
| Capture dataset | 1,000 ASCII notes, target 512 bytes each; 1,024,038 cached text bytes |
| Large dataset | 10,000 notes, target 4,096 bytes each; 10% mixed-language notes; 81,969,038 cached text bytes |
| Distribution | Five equally sized folders, unique creation timestamps; no user files accessed |
| Sampling | Three warmups, then 31 samples per workload in each of three processes per version |
| Run order | Before, after, after, before, before, after; no build/test jobs launched alongside this series |

Fixtures are defined in `src-tauri/src/commands/index_benchmarks.rs`. Each note begins with a unique `Capture` title, followed by repeated meeting/research text. Mixed-language notes include accented Latin characters, `İstanbul`, and Japanese text. Truncation respects UTF-8 boundaries. The last note receives a 19-byte unique marker.

Queries are `CAPTURE` (every note), `unique-zebra-needle` (one note), `no-such-marker` (zero notes), and `CAPTURE` restricted to `Folder2` (20% of notes). Listing returns all note metadata. Locked-note behavior is covered separately by correctness tests.

Timing includes locking, scanning, snippet/result allocation, cloning metadata, and sorting. It excludes fixture construction, assertions, result hashing, and dropping the returned snapshot. Index access is uncontended. HashMap iteration order varies naturally between processes. No claim is made about concurrent throughput.

## Before and after

Milliseconds, pooled 93 samples per version and workload. P50 is the middle sample; P95 is nearest-rank. All samples and per-process summaries are preserved in [the measurement data](2026-09-05-search-performance.json).

| Dataset / operation | Before P50 | After P50 | Before P95 | After P95 | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| 1k / common match | 0.442 | 0.251 | 0.477 | 0.278 | 43.3% lower median |
| 1k / rare match | 0.034 | 0.033 | 0.037 | 0.036 | Small difference; no improvement claim |
| 1k / missing query | 0.032 | 0.031 | 0.035 | 0.036 | No material change |
| 1k / folder match | 0.092 | 0.054 | 0.097 | 0.059 | 41.6% lower median |
| 1k / list metadata | 0.116 | 0.114 | 0.124 | 0.125 | Unchanged code; no improvement claim |
| 10k / common match | 23.582 | 3.826 | 24.420 | 4.635 | 83.8% lower median |
| 10k / rare match | 4.470 | 4.261 | 5.209 | 4.988 | Difference overlaps process variation |
| 10k / missing query | 4.319 | 4.375 | 4.876 | 4.927 | 1.3% higher median; within process variation |
| 10k / folder match | 3.119 | 0.677 | 3.359 | 0.767 | 78.3% lower median |
| 10k / list metadata | 1.478 | 1.478 | 1.701 | 1.731 | Unchanged code; no improvement claim |

Process-median ranges help distinguish the kept improvements from noise:

- 10k common: **23.567–23.709 ms before**, **3.771–3.867 ms after**.
- 10k folder: **3.056–3.229 ms before**, **0.635–0.700 ms after**.
- 10k missing: **4.181–4.535 ms before**, **4.231–4.415 ms after**.
- 1k common: **0.436–0.446 ms before**, **0.247–0.255 ms after**.

This is a small local sample, not a statistical confidence interval or a cross-device guarantee. Initial runs directly after compilation were noisy and are not pooled into this alternating comparison.

## Kept change and rejected experiment

The kept implementation retains the existing `contains` rejection check. For a matching note, it locates the match in the cached normalized text and passes the position and original query byte length to the snippet helper. The helper still uses the same UTF-8 boundary handling, ellipses, newline flattening, and context lengths.

This eliminates the per-result lowercase copy of the whole document and the additional lowercase query allocation. It also removes the helper's unreachable no-match fallback: its only caller now passes a position already found in the same cache. No regression test was removed or consolidated.

The first experiment replaced `contains` with `find` outright. Although common search improved, missing queries regressed: pooled P50 increased from **4.965 to 9.339 ms** on the large dataset, and **0.032 to 0.146 ms** on the capture dataset. That variant was discarded. The final two-stage check is intentional and supported by the release measurements, not an accidental duplicate search.

### Tradeoffs

- **Memory:** The cache representation and lifetime are unchanged. The large fixture still retains 81,969,038 bytes of original plus normalized text, excluding metadata and allocator overhead. Whole-process maximum RSS overlapped: 130,990,080–134,627,328 bytes before versus 130,924,544–132,481,024 after. No meaningful peak-memory reduction is claimed.
- **Tail latency:** Local P95 improves for common/folder queries. These are not UI or concurrent-server tail percentiles.
- **Freshness:** No new memoization or invalidation path. Reindexing still replaces both original and normalized content together.
- **Failure/privacy behavior:** Locked notes remain excluded; ciphertext is not retained as searchable text. Folder filtering, cache-only search, mutex recovery, and public result types remain unchanged.
- **Throughput:** Less work per hit should shorten the time the existing mutex is held, but concurrent throughput and contention were not measured.

## Correctness and repository verification

Before editing production code, the two new behavior tests passed against the original implementation. After the change, all ten index tests also passed in release mode. Tests use real temporary note files and the public index search method, not timing assertions or mocked search responses.

Coverage includes case-insensitive search, beginning/middle/end context, newline flattening, multibyte snippet boundaries, long queries, exact folder filtering, descending timestamps, locked-note exclusion, reindex freshness, and searching after a source file disappears. Existing encryption, path-security, and storage tests remain intact.

The benchmark separately hashes every returned note field and snippet in result order. All eight search workload digests matched before/after in all three process pairs. The ignored benchmark is opt-in; normal CI does not depend on microbenchmark timings.

Fresh checks passed:

- `bun install --frozen-lockfile`: no dependency changes.
- `bun run build`: TypeScript and Vite passed.
- `bun run test`: **181 tests in 42 files passed**.
- `bun run check:platform`: macOS 14 baseline consistent.
- `bun run check:bundle`: **287,378-byte entry**, below the 750,000-byte gate; unchanged from baseline.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --target aarch64-apple-darwin --locked --offline -- -D warnings`.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-features --target aarch64-apple-darwin --locked --offline`: **121 passed**, one ignored performance benchmark.
- `swift test --package-path src-tauri/darwinkit`: **43 passed**.

Existing warnings were not hidden: release-mode Rust compilation reports unused `Code`/`Modifiers` imports in `app.rs`, and Vite reports an existing lazy chunk above 500 kB. Neither was introduced here; the required debug Clippy and entry-bundle gates pass. The initial resource-measurement attempt was blocked by sandbox access to `kern.clockrate`; the complete final series succeeded with authorized access.

### Local app artifact and manual-test boundary

`./scripts/build-dev.sh build` passed using Bun 1.4.1 and produced:

```text
/private/tmp/stik-slop-cleanup.Ocz1cZ/src-tauri/target/aarch64-apple-darwin/debug/bundle/macos/Stik.app
```

The app contains the optimized `4347d5d` source. Both Stik and its DarwinKit sidecar are arm64 executables; the bundle is version 0.8.0 with minimum macOS 14. `codesign --verify --deep --strict --verbose=2` passed. The bundled Stik executable's SHA-256 is `8b01b0d3bbcc54b000ea3acb378c0faaa3cbb80cb6d129c0d95f13a6757a9a57`.

This is an ad-hoc-signed **debug** build for functional testing, not the release benchmark executable and not a notarized distribution. It was not installed or launched. Manual acceptance in capture, sticked-note, and viewing windows remains unverified; test search, folder switching, edited-note freshness, and locked-note exclusion before promotion. The artifact comes from `codex/slop-cleanup`, not `develop`.

## Reproduce

Use separate clean checkouts of baseline `c61901a` and optimized `4347d5d`, with the same Rust/Xcode toolchain. Initialize submodules and use the pinned Bun 1.4.1. Prepare each checkout once:

```sh
git submodule update --init --recursive
./scripts/build-dev.sh sidecar
bun run build
```

Run the same benchmark at each revision:

```sh
STIK_PERF_SAMPLES=31 cargo test \
  --manifest-path src-tauri/Cargo.toml \
  --release --lib --all-features \
  --target aarch64-apple-darwin --locked --offline \
  benchmark_note_index -- --ignored --nocapture --test-threads=1
```

If Cargo dependencies are not cached, omit `--offline` for initial preparation. Do not substitute a debug build: release optimization of dependencies materially affects these workloads.

To match the recorded comparison, copy each emitted `release/deps/stik_lib-*` test executable to a separate before/after path. Then run those two binaries without recompiling, in before/after/after/before/before/after order:

```sh
STIK_PERF_SAMPLES=31 /usr/bin/time -l /path/to/saved-test-binary \
  benchmark_note_index --ignored --nocapture --test-threads=1
```

Each invocation prints raw samples, P50/P95, result counts, cache bytes, and result digests. To isolate one case for profiling, add `STIK_PERF_CASE=large/common`. Pool the 93 samples per workload/version for the table, and inspect each process's median rather than treating all repeated samples as independent process runs.

## Remaining work

1. Missing and rare queries still scan cached document text. The local 10k workload is about 4–5 ms; no new inverted index is justified by this measurement alone.
2. Matching searches still clone all returned metadata, build snippets, and sort all matches while holding one mutex. Result limits or pagination would change contracts and need separate product/latency evidence.
3. Command-palette results await both text and semantic search after a 200 ms debounce. Profile keystroke-to-render latency before deciding whether partial results or debounce changes improve UX.
4. Recent-note loading retrieves the full metadata list before selecting 15 notes. A bounded command is a candidate, not a verified optimization in this task.
5. Editor widget rebuilding and full-document conversions were inspected as candidate repeated work, but were not profiled or changed. Startup, iCloud, and NLP performance also remain unmeasured.

Ponytail full mode kept the change within the existing cache and standard library. The performance-debugging skill supplied the baseline/experiment/retest process; the Rust skill's borrowing guidance led to reusing cached text without adding another owned buffer or abstraction.
