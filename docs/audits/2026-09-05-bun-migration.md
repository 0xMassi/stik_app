# Bun 1.4.1 migration — 2026-09-05

Base: `08ac7f7` on `codex/slop-cleanup`. This is a package-manager migration, not a JavaScript runtime, test-runner, bundler, or dependency-version upgrade.

## Changes

- Pin `packageManager` to `bun@1.4.1` and the local toolchain to `.bun-version`. All four JavaScript-consuming CI/beta/release jobs use `oven-sh/setup-bun@v2` with that version file and retain Node 20.
- Migrate the existing npm lockfile with Bun's native importer; replace `package-lock.json` with the text `bun.lock`. All **361 unique package/version pairs and integrity hashes** are preserved, including platform-specific optional packages. No dependency ranges changed.
- Use `bun install --frozen-lockfile`, `bun run`, and `bunx` in active scripts, Tauri hooks, workflows, and contribution/release instructions. Vitest remains the test runner, and TypeScript/Vite/Vitest still execute on Node. Historical audit/plan documents are left intact.
- Preserve the existing high-severity JavaScript advisory gate with `bun audit --audit-level=high`, and switch Dependabot's JavaScript ecosystem to `bun`. Rust advisory policy is unchanged.
- The development build script checks the exact Bun version and performs a frozen dependency sync on every invocation, including when `node_modules` already exists. This prevents a branch switch from silently using the previous branch's dependency installation.

The npm lockfile remains recoverable from Git. Bun is the only JavaScript lockfile in the resulting branch. The original dirty `main` checkout and clean `develop` checkout were not changed, and no remote writes or deployments were performed.

## Verification

The baseline passed 181 frontend tests, production build, platform consistency, and the 750,000-byte entry budget. The baseline emitted entry was 287,378 bytes.

| Check | Result |
| --- | --- |
| Exact tools | Bun **1.4.1** (`4661e494f`), isolated Node **20.20.2** matching the CI major |
| Clean `bun install --frozen-lockfile` | Pass from an empty `node_modules`; no lockfile modifications |
| `bun pm untrusted` | No blocked dependency lifecycle scripts |
| Frozen-lockfile negative check | A throwaway manifest requiring React 18.3.1 against the React 19.2.4 lock was rejected with `lockfile had changes, but lockfile is frozen`; the lock remained unchanged |
| Wrong Bun version | The dev build script rejects the Mac's existing Bun 1.4.0 before building |
| `bun run test` | **42 files / 181 tests passed** |
| Node runtime probe | TypeScript, Vite, Vitest and Vitest workers confirmed Node 20, not the Bun runtime |
| `bun run build`, `bun run check:bundle`, `bun run check:platform` | Pass; entry remains **287,378 bytes** |
| Production artifact comparison | `diff -qr` found the complete emitted `dist` identical to the npm-installed baseline |
| `bun audit --audit-level=high` | No vulnerabilities found, 356 packages checked by the audit command |
| Workflow/configuration checks | All YAML parsed; all Bun jobs use `.bun-version` and retain Node 20; package-manager pins and Dependabot ecosystem match |
| Shell syntax | `bash -n` passes for the three changed shell scripts |
| Dev-server smoke test | `bun run dev --host 127.0.0.1` served the Stik page on port 1420; server stopped afterward |
| Native build | `./scripts/build-dev.sh build` rebuilt DarwinKit and produced the arm64 debug `Stik.app` using the migrated Bun/Tauri hooks |
| Native artifact inspection | Both executables are arm64; version 0.8.0, minimum macOS 14.0, deep/strict ad-hoc signature verification passes |
| Rust gates | Formatting and strict all-target/all-feature Clippy pass; **119 tests pass** with the arm64 target and locked/offline dependencies |
| Swift gate | `swift test --package-path src-tauri/darwinkit`: **43 tests pass** |
| Repository hygiene | `git diff --check` passes; no Rust manifest, Rust lockfile, or submodule changes |

Bun lockfile SHA-256 after installation and verification: `4daad6a3f190c8712dd075ca5a5bfd06a4c2cd898d504b0a193c84fe357a4470`.

## Installation timing

Measured on this Mac with identical dependency versions, Node 20.20.2, warmed package caches, empty destination directories, and no concurrent native build. One warm-up per manager was discarded, then three samples alternated manager order. npm used `ci --offline --no-audit --no-fund`; Bun used `install --frozen-lockfile --offline`. Lifecycle scripts retained each manager's normal policy.

| Manager | Three measured installs | Median |
| --- | --- | --- |
| npm 10.9.9 | 1.355 s, 1.372 s, 1.285 s | **1.355 s** |
| Bun 1.4.1 | 0.147 s, 0.162 s, 0.156 s | **0.156 s** |

The median ratio is **8.68×** for this warm-cache clean-install workload. It is not a cold-network/CI benchmark, nor a startup, editing, bundling, or Rust/Swift compilation speed claim. The first clean Bun install with an initially empty task-specific Bun cache took about 1.07 seconds, but no matched cold npm run was made.

## Scope limits and local environment

- The global Homebrew Bun remains **1.4.0**. Validation used an isolated 1.4.1 binary; select/install 1.4.1 before running the updated development script from your usual shell.
- Sandbox network/localhost restrictions initially blocked registry and dev-server checks; those checks passed with scoped access. These were environment failures, not application regressions.
- This is a local, ad-hoc-signed debug artifact, not notarized or published. Native GUI workflows were not exercised. Remote GitHub jobs were not triggered; the existing Swift job's missing submodule checkout remains the pre-existing concern documented in the cleanup audit.
- The existing large lazy-chunk and `.app` bundle-identifier warnings remain. No app features or user data were changed.

Local artifact: `src-tauri/target/aarch64-apple-darwin/debug/bundle/macos/Stik.app` in the cleanup worktree.

References: [Bun lockfile migration](https://bun.sh/docs/pm/lockfile), [frozen installation](https://bun.sh/docs/pm/cli/install), [Bun audit](https://bun.sh/docs/pm/cli/audit), [setup-bun version files](https://github.com/oven-sh/setup-bun), and [Dependabot's Bun support](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories).
