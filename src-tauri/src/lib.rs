//! Native foundation core, testable without the desktop webview.
pub mod run_store;
pub mod model_endpoint;

#[cfg(feature = "desktop")]
pub mod foundation_commands;
pub mod skill_imports;
#[cfg(feature = "desktop")]
pub mod web_transport;
#[cfg(feature = "desktop")]
pub mod web_tools;
