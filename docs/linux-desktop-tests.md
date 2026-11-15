# Linux desktop compatibility tests

Taro's native Linux stack uses **GLib >=2.70, GTK 3.24, and WebKitGTK 4.1 >=2.40**. WebKitGTK 4.1 is the GTK3/libsoup3 ABI; GTK4/WebKitGTK6 packages do not substitute for it. Rust and Node versions in CI match the cloud toolchain: Rust 1.99.1, Node 24, pnpm 12.3.4.

On Ubuntu 24.04 or Debian 12+, install the supported distribution packages:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libglib2.0-dev libgtk-3-dev \
  libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev \
  xvfb xauth dbus-x11
pnpm install --frozen-lockfile
pnpm build
bash scripts/test-linux-desktop.sh
```

Node and Git must also be available: the existing MCP/LSP tests launch local Node servers and session tests create temporary Git repositories.

The runner checks prerequisites and fails if any are missing. It starts an isolated D-Bus session and Xvfb display, then runs **every native test target** with `desktop-tests` enabled and one test thread. Tests are not ignored or converted into successful skips when libraries or the display are absent. WebKit's sandbox remains enabled; run tests as an ordinary user. A 30-second deadline makes a failed WebKit load fail the test rather than hanging indefinitely.

Coverage added:

- `tests/linux_desktop.rs` initializes real GTK/GLib, creates a real WebKit webview, loads local HTML, pumps the GLib event loop and verifies JavaScript changes its title. No provider or external website is contacted.
- `tests/foundation_ipc.rs` invokes actual registered Tauri command macros using Tauri's mock runtime and real SQLite storage/worker execution. It covers camelCase argument transport, run creation, exchange persistence, reservation, intent/start/outcome, retained full-output retrieval, foreign-scope rejection, completion, and unavailable-storage error propagation. This tests command transport; it does not simulate a real Wry window or claim whole-app E2E coverage.
- The existing native desktop binary tests and native-core tests run in the same invocation. The additive `desktop-tests` feature does not change the default production feature set.

For a machine without desktop libraries, the independent storage suite remains runnable:

```sh
cargo test --manifest-path src-tauri/Cargo.toml --locked --no-default-features --lib
```

`.github/workflows/linux-desktop.yml` provisions Ubuntu 24.04 for separate core and full desktop jobs on pushes to `main`/`agent-foundation`, pull requests and manual runs. The desktop job also runs frontend tests, TypeScript and the production frontend build before native tests. It uses the frozen pnpm lockfile and locked Cargo resolution.

The cloud host has no privileged system package installer. Its local Docker daemon can run a separate Debian Bookworm image with these packages installed; this validates the real libraries without changing host permissions. See the native progress report for the actual run results and remaining platform limits. Linux tests do not establish Windows process/junction/permission behavior, and these tests do not verify live AI providers or the pending agent-runtime integration.

## Verified run

The full runner passed in the cloud's Docker environment using Rust 1.99.1 on Debian Bookworm with GLib 2.74.6, GTK 3.24.38 and WebKitGTK 2.50.6. Tests ran as an ordinary registered user, under Xvfb and D-Bus, with WebKit's sandbox enabled.

- Native core: 24 passed.
- Existing desktop binary tests: 65 passed, with Node 24 present for real MCP/LSP local-server tests.
- Tauri IPC integration: 2 passed.
- Real GTK/WebKit smoke: 1 passed.
- Total native: 92 passed, zero failed/ignored. The separate documentation-test target contained zero tests; it is not counted as validation.
- Frontend: 148 tests passed; TypeScript and production build passed.

The initial container run failed an existing MCP stdio test because the base Rust image lacked Node; Node 24 was installed and added to runner prerequisites before the successful full run. A nonfatal AT-SPI accessibility-bus warning was emitted by the minimal container; it did not prevent GTK/WebKit loading or JavaScript execution. The cloud host itself still lacks desktop development packages; the compatible container supplies them.

The new GitHub Actions workflow has been added, but remote Actions results have not been inspected: this environment's GitHub API access is denied. The figures above come from the completed local container run, not a claimed CI run.

The independent review agent was unavailable due to its usage limit. A direct source/API/workflow review was performed instead; it is weaker evidence than a separate reviewer.
