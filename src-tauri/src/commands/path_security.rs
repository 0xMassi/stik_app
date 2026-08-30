use std::path::{Component, Path, PathBuf};

/// Accept only one ordinary filename component. IPC and Markdown inputs must
/// never be able to add path structure below an authorized directory.
pub fn validate_filename_component(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.starts_with('.')
        || value.contains('/')
        || value.contains('\\')
        || value.chars().any(char::is_control)
    {
        return Err("Invalid filename".to_string());
    }

    let mut components = Path::new(value).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(value),
        _ => Err("Invalid filename".to_string()),
    }
}

pub fn authorize_existing_path(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve authorized root: {error}"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| format!("Cannot resolve path: {error}"))?;

    if canonical_candidate.starts_with(&canonical_root) {
        Ok(canonical_candidate)
    } else {
        Err("Path is outside the authorized root".to_string())
    }
}

pub fn authorize_new_path(root: &Path, candidate: &Path) -> Result<PathBuf, String> {
    if candidate.exists() {
        return authorize_existing_path(root, candidate);
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("Cannot resolve authorized root: {error}"))?;
    let relative = candidate
        .strip_prefix(root)
        .or_else(|_| candidate.strip_prefix(&canonical_root))
        .map_err(|_| "Path is outside the authorized root".to_string())?;

    let mut authorized = canonical_root.clone();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err("Path contains an invalid component".to_string());
        };

        let next = authorized.join(name);
        if std::fs::symlink_metadata(&next).is_ok() {
            let resolved = next
                .canonicalize()
                .map_err(|error| format!("Cannot resolve target path: {error}"))?;
            if !resolved.starts_with(&canonical_root) {
                return Err("Path is outside the authorized root".to_string());
            }
            authorized = resolved;
        } else {
            authorized = next;
        }
    }

    Ok(authorized)
}

#[cfg(test)]
mod tests {
    use super::{authorize_existing_path, authorize_new_path, validate_filename_component};
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(label: &str) -> PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("stik-path-{label}-{nonce}"));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn filename_component_rejects_all_path_structure() {
        for invalid in ["", ".hidden", "..", "a/b.png", "a\\b.png", "/tmp/a.png"] {
            assert!(validate_filename_component(invalid).is_err(), "{invalid}");
        }
        assert_eq!(validate_filename_component("image.png"), Ok("image.png"));
    }

    #[test]
    fn existing_path_must_canonicalize_inside_root() {
        let root = temp_dir("existing-root");
        let inside = root.join("folder/note.md");
        fs::create_dir_all(inside.parent().unwrap()).unwrap();
        fs::write(&inside, "inside").unwrap();

        let outside_dir = temp_dir("existing-outside");
        let outside = outside_dir.join("secret.md");
        fs::write(&outside, "outside").unwrap();

        assert_eq!(
            authorize_existing_path(&root, &inside).unwrap(),
            inside.canonicalize().unwrap()
        );
        assert!(authorize_existing_path(&root, &outside).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn existing_path_rejects_a_symlink_escape() {
        use std::os::unix::fs::symlink;

        let root = temp_dir("symlink-root");
        let outside_dir = temp_dir("symlink-outside");
        let outside = outside_dir.join("secret.md");
        fs::write(&outside, "outside").unwrap();
        let link = root.join("linked.md");
        symlink(&outside, &link).unwrap();

        assert!(authorize_existing_path(&root, &link).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[cfg(unix)]
    #[test]
    fn new_path_rejects_a_symlinked_parent_escape() {
        use std::os::unix::fs::symlink;

        let root = temp_dir("target-root");
        let outside_dir = temp_dir("target-outside");
        symlink(&outside_dir, root.join("assets")).unwrap();

        assert!(authorize_new_path(&root, &root.join("assets/image.png")).is_err());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside_dir);
    }

    #[test]
    fn new_path_allows_missing_nested_directories_inside_root() {
        let root = temp_dir("missing-parent-root");
        let target = root.join("Projects/Work/note.md");
        let expected = root.canonicalize().unwrap().join("Projects/Work/note.md");

        assert_eq!(authorize_new_path(&root, &target).unwrap(), expected);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn new_path_rejects_a_lexical_escape() {
        let root = temp_dir("lexical-root");
        let target = root.join("../outside.md");

        assert!(authorize_new_path(&root, &target).is_err());

        let _ = fs::remove_dir_all(root);
    }
}
