#[cfg(feature = "desktop")]
use std::{fs, path::Path};

#[cfg(feature = "desktop")]
fn collect_markdown(root: &Path, directory: &Path, files: &mut Vec<String>) {
    for entry in fs::read_dir(directory).expect("read private guidance directory") {
        let entry = entry.expect("read private guidance entry");
        let path = entry.path();
        let kind = entry.file_type().expect("inspect private guidance entry");
        if kind.is_dir() {
            collect_markdown(root, &path, files);
        } else if kind.is_file() && path.extension().and_then(|item| item.to_str()) == Some("md") {
            files.push(
                path.strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/"),
            );
        }
    }
}

#[cfg(feature = "desktop")]
fn embed_private_guidance() {
    let source = Path::new("../taro-adi-library");
    println!("cargo:rerun-if-changed={}", source.display());
    let mut paths = Vec::new();
    let mut generated = String::new();
    if let Ok(root) = source.canonicalize() {
        collect_markdown(&root, &root, &mut paths);
        let manifest = root.join("manifest.json");
        assert!(manifest.is_file(), "private guidance manifest is missing");
        generated.push_str(&format!(
            "const MANIFEST: &str = include_str!({:?});\n",
            manifest.to_string_lossy()
        ));
        generated.push_str("const DOCUMENTS: &[(&str, &str)] = &[\n");
        paths.sort();
        for path in paths {
            generated.push_str(&format!(
                "({path:?}, include_str!({:?})),\n",
                root.join(&path).to_string_lossy()
            ));
        }
    } else {
        generated.push_str("const MANIFEST: &str = \"\";\nconst DOCUMENTS: &[(&str, &str)] = &[\n");
    }
    generated.push_str("];\n");
    fs::write(
        Path::new(&std::env::var_os("OUT_DIR").unwrap()).join("private_guidance.rs"),
        generated,
    )
    .expect("write native guidance index");
}

fn main() {
    #[cfg(feature = "desktop")]
    {
        embed_private_guidance();
        tauri_build::build();
    }
}
