# Agent workflow

- Read `CONTRIBUTING.md`. Preserve existing work; inspect `git status`, `git branch -avv`, and `git worktree list` before editing. Use an isolated worktree when needed.
- Use Ponytail in full mode when available; report if unavailable. Prefer existing code, standard libraries, and small verified changes.
- Bun **1.4.1** (`.bun-version`, `bun.lock`) is the package manager. Keep Node 20+ and Vitest; use `bun run test`, not `bun test`. No competing lockfiles.
- Bootstrap: `./scripts/build-dev.sh setup`. Diagnose prerequisites: `./scripts/build-dev.sh doctor`. Both work from any directory.
- Required local checks: `./scripts/verify.sh`. It bootstraps, builds, runs platform/bundle gates, Vitest, Rust format/strict Clippy/tests, and Swift tests. CI's advisory audits remain separate network-dependent gates.
- Targeted storage QA: `cargo test --manifest-path src-tauri/Cargo.toml --test note_workflow --all-features --locked -- --nocapture`. It uses real temporary files and no production account.
- Interactive QA: `./scripts/build-dev.sh dev` (hot reload) or `./scripts/build-dev.sh qa` (addressable native `Stik Dev.app`). These launch isolated profiles; **do not launch the ordinary build against personal notes for unattended QA**.
- Data and logs are printed at startup; keep failures for diagnosis. Never set `HOME` to isolate the app. Never read/copy personal notes or credentials into fixtures. `STIK_DEV_ROOT` is data isolation, not an OS security sandbox.
- No runtime login or secret is needed for local capture/search QA. iCloud, Apple Notes, Keychain, dictation, notifications, and real OS integrations need separate, explicitly authorized manual testing.
- Do not create issues/PRs, push, merge, or publish without conversation authorization. An owner's direct local request does not require posting an issue first.
- Verify behavior, not just exit codes. New gates must catch a deliberate failure in a disposable worktree. Report tested revision, commands, failures, and unverified UI/OS behavior.
