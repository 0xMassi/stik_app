# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous minor | Security fixes only |
| Older | No |

We recommend always running the latest version. Stik includes a built-in auto-updater starting from v0.3.3.

Supported builds require macOS 14 (Sonoma) or newer.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Instead, please report them privately:

- **Email**: [security@stik.ink](mailto:security@stik.ink)
- **GitHub**: Use [private vulnerability reporting](https://github.com/0xMassi/stik_app/security/advisories/new)

Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## What to Expect

- **Acknowledgment** within 48 hours
- **Assessment** within 1 week
- **Fix timeline** depends on severity:
  - **Critical** (remote code execution, data exfiltration): Patch release within 72 hours
  - **High** (privilege escalation, arbitrary file access): Patch within 1 week
  - **Medium/Low**: Included in the next scheduled release

We will credit reporters in the release notes unless anonymity is requested.

## Scope

### In scope

- The Stik macOS application (Rust backend, React frontend)
- The DarwinKit sidecar (Swift NLP CLI)
- Data handling: note storage, settings, image assets
- IPC between frontend and backend (Tauri invoke/events)
- The auto-updater mechanism
- The Homebrew tap distribution

### Out of scope

- The landing page (stik.ink) -- report separately to [help@stik.ink](mailto:help@stik.ink)
- Third-party dependencies -- report upstream, but let us know if it affects Stik
- Attacks requiring physical access to an unlocked machine
- Social engineering

## Security Design

Stik is designed with a minimal attack surface:

- **On-device note processing**: AI and dictation run locally through Apple frameworks and WhisperKit. Note content is never sent to an analytics service.
- **No account**: Stik has no hosted account or required cloud service. Optional file sync is configured by the user through iCloud Drive, Dropbox, Syncthing, or git.
- **Opt-in analytics**: Anonymous analytics are disabled by default and no identifier is created before explicit consent. If enabled, Stik sends app/note lifecycle events, word counts, OS/app version, architecture, locale, screen resolution, and a random identifier to PostHog EU. It never sends note content, titles, folder names, paths, or personal information; disabling analytics deletes the identifier.
- **Local storage only**: Notes are plain `.md` files in `~/Documents/Stik/`. Settings in `~/.stik/`.
- **Path containment**: Stik is not App-Sandboxed, because it must work with user-selected note folders. Filesystem commands authorize note, asset, font, and lock operations against configured roots and reject traversal and symlink escapes.
- **Signed and notarized**: Release builds are code-signed with a Developer ID certificate and notarized by Apple.
- **Signed updates**: Auto-update artifacts are signed with a separate key to prevent tampered updates.

## Dependency Management

We keep dependencies minimal and review updates regularly. If you notice a vulnerable dependency in our `Cargo.toml` or `package.json`, please let us know.
