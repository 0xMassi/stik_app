use std::path::{Component, Path, PathBuf};

fn validate_dev_root(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.parent().is_none()
        || path.components().any(|part| part == Component::ParentDir)
    {
        return Err("STIK_DEV_ROOT must be an absolute, non-root path without '..'".into());
    }
    Ok(())
}

/// Opt-in development state, never a fallback to the user's regular vault.
pub fn dev_root() -> Result<Option<PathBuf>, String> {
    static ROOT: std::sync::OnceLock<Result<Option<PathBuf>, String>> = std::sync::OnceLock::new();
    ROOT.get_or_init(resolve_dev_root).clone()
}

fn resolve_dev_root() -> Result<Option<PathBuf>, String> {
    let Some(value) = std::env::var_os("STIK_DEV_ROOT") else {
        return Ok(None);
    };
    if !cfg!(debug_assertions) {
        return Err("STIK_DEV_ROOT requires a debug build".into());
    }
    let root = PathBuf::from(value);
    validate_dev_root(&root)?;
    let root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve STIK_DEV_ROOT: {error}"))?;
    validate_dev_root(&root)?;
    if !root.is_dir() {
        return Err("STIK_DEV_ROOT must be a directory".into());
    }
    Ok(Some(root))
}

pub fn config_dir() -> Result<PathBuf, String> {
    let directory = match dev_root()? {
        Some(root) => root.join("config"),
        None => dirs::home_dir()
            .ok_or("Could not find home directory")?
            .join(".stik"),
    };
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_ambiguous_development_roots() {
        for path in ["", ".", "relative", "/", "/tmp/../Users"] {
            assert!(validate_dev_root(Path::new(path)).is_err(), "{path}");
        }
        assert!(validate_dev_root(Path::new("/tmp/stik-qa/session")).is_ok());
    }
}
