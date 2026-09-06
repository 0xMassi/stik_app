#!/bin/bash
set -Eeuo pipefail

readonly REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$REPO_ROOT"
readonly started=$SECONDS
trap 'printf "Verification failed at line %s. Data retained at %s\n" "$LINENO" "${STIK_DEV_ROOT:-not-created}" >&2' ERR

./scripts/build-dev.sh setup

# Never use a developer's regular configuration when running native tests.
STIK_DEV_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/stik-verify.XXXXXX")"
export STIK_DEV_ROOT
node --input-type=module -e '
  import {mkdirSync, writeFileSync} from "node:fs";
  import {join} from "node:path";
  const config = join(process.env.STIK_DEV_ROOT, "config");
  mkdirSync(config);
  writeFileSync(join(config, "settings.json"), JSON.stringify({shortcut_mappings:[],default_folder:"Inbox"}));
'
printf 'Verification data: %s\n' "$STIK_DEV_ROOT"

bun run check:platform
bun run check:bundle
bun run test
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked
swift test --package-path src-tauri/darwinkit
printf 'Verification passed in %ss. Disposable data retained at %s\n' "$((SECONDS - started))" "$STIK_DEV_ROOT"
