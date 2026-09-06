# Agent setup and verification

## Result and scope

Implemented on `codex/agent-workflow`, code revision `0dc9fe9`, based on `5b42a15` (the completed cleanup, Bun migration, and search-performance work). The main checkout's existing edits and other branches were preserved. No remote writes, merges, deployments, credentials, or personal note data were needed.

Inspected and exercised fresh checkout setup, frontend and native builds/tests, data paths, startup services, port conflicts, logs, targeted storage QA, and native app discovery. This is workflow coverage, not an exhaustive application audit or a UI end-to-end pass.

## Observed blockers and changes

| Observed problem | Smallest implemented change | Verification enabled |
| --- | --- | --- |
| A fresh checkout failed with missing `darwinkit/Package.swift`; platform checking ran before submodule setup. Swift tests failed for the same reason. | Initialize the pinned submodule before checks; add `setup` and read-only `doctor` modes. | Bootstrap without copied build artifacts. |
| Three CI jobs read DarwinKit but did not initialize submodules. | Recursive checkout in those jobs. | The same missing-source failure is addressed in CI; remote execution remains unverified. |
| Rust builds require `protoc`, absent from documented prerequisites. | Document it and check tools/components up front. | Actionable prerequisite failures before compilation. |
| Native development normally uses personal notes, configuration, and account integrations. | Debug-only `STIK_DEV_ROOT`; shared configuration path; isolated notes; account-service defaults/guards. | Repeatable local capture/search/storage QA without production data or secrets. |
| Checks were scattered and native unit checks could use personal configuration. | `scripts/verify.sh` wraps existing checks with disposable settings/data. | One fail-fast local verification command. |
| No real-storage check covered a complete local note lifecycle. | One integration test using actual temporary files. | Save/read/search, update freshness, cursor persistence, trash/restore, and path rejection. |
| Development sessions could collide on port 1420. | Loopback-only configurable port, with preflight collision check. | Concurrent worktrees without killing another listener. |
| Swift test/build output repeatedly restarted Tauri during QA. | Ignore only DarwinKit's generated `.build/` in `.taurignore`. | Swift checks can coexist with native development; Rust source edits still reload. |
| Bare hot-reload binaries were not addressable by native automation. | `qa` builds and launches `com.stik.dev` / `Stik Dev.app`. | Bundle discovery works; reading its UI still timed out on this host. |

The watcher ignore uses Tauri's documented [development watcher configuration](https://v2.tauri.app/fr/develop/). No test runner, application runtime, dependencies, or security gates were replaced. Ponytail full mode and the shell/QA guidance kept this to existing commands, standard-library checks, and one behavioral integration test.

## Reproduction

Run from this branch's worktree (currently `/private/tmp/stik-agent-workflow.Lm47jI`):

```bash
./scripts/build-dev.sh doctor
./scripts/build-dev.sh setup
./scripts/verify.sh
./scripts/build-dev.sh qa
# Or hot reload on another loopback port:
STIK_DEV_PORT=1422 ./scripts/build-dev.sh dev
```

After setup, the focused real-storage check is:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --test note_workflow --all-features --locked -- --nocapture
```

`verify` always creates fresh data. `dev`/`qa` print the profile and `logs/dev.log`; Ctrl-C stops the owned session, leaving data for diagnosis. Pass `STIK_DEV_ROOT=/absolute/session` to resume it. Use the launcher, not a later direct bundle launch, to supply isolation. The profile is not an OS sandbox: do not select personal files or exercise account integrations during unattended QA.

## Measured verification

Host: Apple M4 Max, 36 GiB RAM, macOS 27.0 build 26A5421a; Bun 1.4.1, Node 25.8.0, rustc 1.98.0, protoc 33.0. DarwinKit was checked out at `83ef481f2cbe2b69da4582aeb5d17ce852ec66c4`. Node 20 remains the CI configuration; no Node runtime migration was made.

| Run | Wall time | Result |
| --- | ---: | --- |
| Fresh detached worktree `0dc9fe9`, no copied dependencies/build output | 102.14 s | Full setup and verification passed. Bun installed 302 packages in 311 ms. |
| Implementation worktree, warm build artifacts | 32.52 s | Full verification passed. |
| Clean validation worktree after removing deliberate fault | 24.57 s | Full verification passed again; tracked files clean. |

Global download caches were warm, including Swift package downloads. These are local setup observations, not cold-network timings or performance benchmarks; concurrent development work can affect timing.

Each full pass included 181 frontend tests in 42 files, 122 Rust unit tests plus the new integration test, and 43 Swift tests. The opt-in Rust performance benchmark remained ignored by ordinary tests. TypeScript/Vite build, platform consistency, bundle budget (287,378 entry bytes versus 750,000 budget), Rust formatting, and strict all-target/all-feature Clippy passed. Node 25 emitted an existing `--localstorage-file` warning; it did not fail tests.

The native `Stik Dev.app` built successfully as arm64, reported bundle ID `com.stik.dev`, and passed `codesign --verify --deep --strict`. Startup reached the capture setup log. Signing/notarization for distribution was not attempted.

## Failure-detection evidence

- In the disposable validation worktree, removed the actual write from `save_note_inner`. The new integration test exited 101 at the first readback because the note file did not exist. Restored the write, confirmed `git diff --exit-code`, then reran the full passing workflow. No fault remains.
- Occupied an ephemeral loopback port with an owned test server. `dev` exited 1 with `EADDRINUSE` and alternate-port guidance before installation/build. The probe closed its own server.
- Added a disposable Rust comment and generated Swift output while `dev` ran. Only the Rust path triggered rebuilding. Both probes were removed, and the owned application/dev server were stopped.

Local raw logs: `/private/tmp/stik-agent-clean-verification.log`, `/private/tmp/stik-agent-restored-verification.log`, `/private/tmp/stik-agent-deliberate-failure.log`, and `/private/tmp/stik-agent-watch-validation.log`. These temporary files are not permanent repository artifacts.

## Remaining manual steps and access

Native automation discovered the running bundle, but reading it by full path or bundle ID timed out (`timeoutReached`, -10005). No automated typing/clicking flow completed. A process sample showed the main thread waiting in the AppKit event loop; that is not proof the UI is correct. Complete the documented capture → save → browse → edit → reopen → trash/restore flow manually before claiming UI acceptance.

No runtime login or external credentials are required for local storage QA. Real iCloud/Apple Notes, Keychain/biometrics, microphone/dictation, global shortcuts, notifications, signing/notarization, and remote Git behavior remain separately authorized integration tests. Restoring native automation access/readability is the specific requirement for unattended UI QA; this run did not establish that an additional permission grant would resolve the timeout.

CI configuration was repaired but not pushed or run remotely. Its network-dependent dependency audits remain required and separate from the local workflow. Validation used current local toolchains, not every supported macOS/Node version. Swift transitive resolution and cold network provisioning were not made hermetic in this task.
