#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != Linux ]]; then
  echo 'This runner requires Linux with GLib >=2.70, GTK 3.24 and WebKitGTK 4.1 >=2.40.' >&2
  exit 1
fi
for command in pkg-config cargo dbus-run-session xvfb-run node git; do
  if ! command -v "$command" >/dev/null; then
    echo "Missing $command. See docs/linux-desktop-tests.md for prerequisites." >&2
    exit 1
  fi
done
pkg-config --print-errors --exists 'glib-2.0 >= 2.70' 'gtk+-3.0 >= 3.24' 'webkit2gtk-4.1 >= 2.40'
pkg-config --modversion glib-2.0 gtk+-3.0 webkit2gtk-4.1

# Run every native target, including the existing desktop binary tests and the
# real WebKit smoke test. Missing prerequisites and test failures are failures.
dbus-run-session -- xvfb-run -a cargo test --manifest-path src-tauri/Cargo.toml \
  --locked --features desktop-tests -- --test-threads=1
