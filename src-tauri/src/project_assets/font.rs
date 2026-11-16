use super::{read_bounded, MAX_BYTES};
use std::{
    env, fs,
    io::ErrorKind,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const UNAVAILABLE: &str = "Font subsetting needs Python and FontTools with Brotli. Install fonttools[woff] and make that Python available to Taro.";

pub(super) fn subset(bytes: &[u8], text: &str) -> Result<Vec<u8>, String> {
    let python = executable()?;
    let scratch =
        tempfile::tempdir().map_err(|_| "Could not create a temporary folder for the font.")?;
    let root = scratch.path();
    fs::write(root.join("original.font"), bytes)
        .map_err(|_| "Could not stage the original font.")?;
    fs::write(root.join("copy.txt"), text).map_err(|_| "Could not stage the font subset text.")?;
    let mut command = Command::new(python);
    command
        .current_dir(root)
        .args([
            "-m",
            "fontTools.subset",
            "original.font",
            "--text-file=copy.txt",
            "--output-file=subset.woff2",
            "--flavor=woff2",
            "--layout-features=*",
            "--name-IDs=*",
            "--name-languages=*",
            "--name-legacy",
            "--no-ignore-missing-unicodes",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = command.spawn().map_err(|error| {
        if error.kind() == ErrorKind::NotFound {
            UNAVAILABLE
        } else {
            "Could not start FontTools."
        }
    })?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("FontTools could not subset this font. Check that fonttools[woff] is installed in the chosen Python and that the source font covers the requested characters.".into()),
            Ok(None) if started.elapsed() < Duration::from_secs(20) => thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Font subsetting did not finish.".into());
            }
        }
    }
    let result = read_bounded(&root.join("subset.woff2"), MAX_BYTES)?;
    if result.len() < 48
        || !result.starts_with(b"wOF2")
        || result[8..12] != (result.len() as u32).to_be_bytes()
    {
        return Err("FontTools did not return a valid WOFF2 font.".into());
    }
    if result.len() >= bytes.len() {
        return Err(
            "No smaller WOFF2 was produced. Use fewer characters or retain the existing font."
                .into(),
        );
    }
    Ok(result)
}

fn executable() -> Result<PathBuf, String> {
    let names: &[&str] = if cfg!(windows) {
        &["python.exe", "python3.exe"]
    } else {
        &["python3", "python"]
    };
    if let Some(path) = env::var_os("TARO_ASSET_PYTHON") {
        let path = PathBuf::from(path);
        if path.is_absolute()
            && (!cfg!(windows)
                || path
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("exe")))
            && path.is_file()
        {
            return Ok(path);
        }
        return Err("TARO_ASSET_PYTHON must point to an installed Python executable.".into());
    }
    env::var_os("PATH")
        .as_deref()
        .into_iter()
        .flat_map(env::split_paths)
        .filter(|path| path.is_absolute())
        .flat_map(|dir| names.iter().map(move |name| dir.join(name)))
        .find(|path| path.is_file())
        .ok_or_else(|| UNAVAILABLE.into())
}
