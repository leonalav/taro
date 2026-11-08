//! Native foundation core, testable without the desktop webview.
pub mod run_store;

#[cfg(feature = "desktop")]
pub mod foundation_commands;
