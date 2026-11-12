//! Chromium inspection uses a dependency-free Node 22 helper over private stdio.
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;

struct Bridge {
    child: Child, input: Option<ChildStdin>, output: BufReader<ChildStdout>, profile_root: std::path::PathBuf,
    #[cfg(windows)]
    job: Option<crate::terminals::ProcessJob>,
}
#[derive(Default)]
pub struct ReviewBrowser(Mutex<Option<Bridge>>);

impl Bridge {
    fn start() -> Result<Self, String> {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
        let profile_root = std::env::temp_dir().join(format!("taro-review-native-{}-{nonce}", std::process::id()));
        std::fs::create_dir(&profile_root).map_err(|e| format!("Could not create the isolated browser profile: {e}"))?;
        let mut command = Command::new("node");
        command.args(["--input-type=module", "--eval", include_str!("../../scripts/review-browser.mjs"), "--", "--stdio"])
            .env("TARO_REVIEW_PROFILE_ROOT", &profile_root)
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null()).kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command.spawn().map_err(|_| { let _ = std::fs::remove_dir(&profile_root); "Review previews require Node.js 22+ on PATH and Microsoft Edge or Google Chrome. Install them, then retry opening the preview.".to_string() })?;
        #[cfg(windows)]
        let job = crate::terminals::ProcessJob::attach(child.raw_handle())?;
        let input = child.stdin.take().ok_or("Could not connect to the browser input.")?;
        let output = BufReader::new(child.stdout.take().ok_or("Could not connect to the browser output.")?);
        Ok(Self { child, input:Some(input), output, profile_root, #[cfg(windows)] job:Some(job) })
    }
    async fn request(&mut self, request: Value) -> Result<Value, String> {
        if self.child.try_wait().map_err(|e| e.to_string())?.is_some() { return Err("The preview browser stopped. Reopen the preview to retry.".into()); }
        let mut line = serde_json::to_vec(&request).map_err(|e| e.to_string())?; line.push(b'\n');
        let input = self.input.as_mut().ok_or("Preview browser is shutting down.")?;
        input.write_all(&line).await.map_err(|_| "Preview browser input disconnected.".to_string())?;
        input.flush().await.map_err(|e| e.to_string())?;
        let mut response = String::new();
        let size = tokio::time::timeout(std::time::Duration::from_secs(45), self.output.read_line(&mut response)).await
            .map_err(|_| "Preview browser timed out. Reopen the preview to retry.".to_string())?
            .map_err(|e| e.to_string())?;
        if size == 0 { return Err("The browser helper exited. Review requires Node.js 22+ and an installed Chromium browser.".into()); }
        let value: Value = serde_json::from_str(&response).map_err(|_| "Invalid response from the preview browser.".to_string())?;
        if value["ok"] == true { Ok(value["value"].clone()) } else { Err(value["error"].as_str().unwrap_or("Browser request failed.").to_string()) }
    }
    async fn shutdown(mut self) {
        // EOF lets Node close Chromium and remove its profile before exiting.
        self.input.take();
        if tokio::time::timeout(std::time::Duration::from_secs(3), self.child.wait()).await.is_err() { self.kill_tree(); let _ = self.child.wait().await; }
        #[cfg(windows)]
        self.job.take();
        for _ in 0..10 { if self.remove_profile().is_ok() { break; } tokio::time::sleep(std::time::Duration::from_millis(100)).await; }
    }
    fn kill_tree(&mut self) {
        #[cfg(windows)]
        self.job.take();
        #[cfg(unix)]
        if let Some(pid) = self.child.id() { let _ = std::process::Command::new("kill").args(["-KILL", "--", &format!("-{pid}")]).status(); }
        let _ = self.child.start_kill();
    }
    fn remove_profile(&self) -> std::io::Result<()> {
        // This directory was exclusively created by this Bridge; never delete a supplied path.
        if self.profile_root.parent() == Some(std::env::temp_dir().as_path()) && self.profile_root.file_name().is_some_and(|name| name.to_string_lossy().starts_with("taro-review-native-")) {
            match std::fs::remove_dir_all(&self.profile_root) { Err(e) if e.kind()==std::io::ErrorKind::NotFound=>Ok(()), result=>result }
        } else { Err(std::io::Error::other("Invalid owned browser profile path")) }
    }
}
impl Drop for Bridge {
    fn drop(&mut self) { self.kill_tree(); let _ = self.remove_profile(); }
}
impl ReviewBrowser {
    pub fn close_all(&self) {
        if let Ok(mut locked) = self.0.try_lock() { if let Some(bridge) = locked.take() { tauri::async_runtime::block_on(bridge.shutdown()); } }
        // A request already executing at process exit is still contained by its kill-on-close job.
    }
}

#[tauri::command]
pub async fn review_browser(request: Value, browser: tauri::State<'_, ReviewBrowser>) -> Result<Value, String> {
    let mut locked = browser.0.lock().await;
    if locked.is_none() { *locked = Some(Bridge::start()?); }
    let result = locked.as_mut().unwrap().request(request).await;
    // Application/selector errors retain the live page; a dead helper is restarted on the next call.
    let dead = locked.as_mut().is_some_and(|bridge| bridge.child.try_wait().ok().flatten().is_some());
    if dead || result.as_ref().err().is_some_and(|e| e.contains("timed out") || e.contains("disconnected")) { if let Some(bridge) = locked.take() { bridge.shutdown().await; } }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Requires Node.js 22 and an installed Chromium browser"]
    async fn native_stdio_bridge_returns_actual_browser_geometry() {
        let mut bridge = Bridge::start().unwrap();
        let opened = bridge.request(serde_json::json!({"key":"native-review-test","action":"open","html":"<!doctype html><h1 id='hero' style='width:321px;height:87px'>Native preview</h1>","viewport":{"width":920,"height":720}})).await.unwrap();
        assert_eq!(opened["viewport"]["width"], 920);
        assert!(opened["screenshot"].as_str().unwrap().starts_with("data:image/png;base64,"));
        let inspected = bridge.request(serde_json::json!({"key":"native-review-test","action":"inspect","selector":"#hero"})).await.unwrap();
        assert_eq!(inspected["selection"]["rect"]["width"], 321);
        assert_eq!(inspected["selection"]["rect"]["height"], 87);
        // Closing stdin lets the helper shut down Chromium and remove its temporary profile.
        let profile = bridge.profile_root.clone();
        bridge.shutdown().await;
        assert!(!profile.exists(), "the owned browser profile was cleaned up");
    }
    #[tokio::test]
    #[ignore = "Requires Node.js 22 and an installed Chromium browser"]
    async fn forced_bridge_reset_terminates_browser_descendants_and_cleans_profile() {
        let mut bridge = Bridge::start().unwrap();
        bridge.request(serde_json::json!({"key":"forced-reset","action":"open","html":"<h1>Owned process tree</h1>","viewport":{"width":800,"height":600}})).await.unwrap();
        let profile = bridge.profile_root.clone();
        bridge.kill_tree();
        bridge.shutdown().await;
        assert!(!profile.exists(), "forced resets do not retain a locked Chromium profile");
    }
}
