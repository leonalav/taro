#![cfg(all(target_os = "linux", feature = "desktop-tests"))]

use gtk::prelude::*;
use std::{
    cell::Cell,
    rc::Rc,
    time::{Duration, Instant},
};
use webkit2gtk::{LoadEvent, WebViewExt};

/// Exercises real GTK, GLib's event loop and WebKit's JavaScript process.
/// Run under dbus-run-session + xvfb-run, without disabling WebKit's sandbox.
#[test]
fn glib_gtk_webkit_loads_and_executes_local_html() {
    gtk::init().expect("GTK needs an X11 display; use scripts/test-linux-desktop.sh");
    assert!(
        gtk::glib::check_version(2, 70, 0).is_none(),
        "GLib >=2.70 required"
    );
    assert!(
        gtk::check_version(3, 24, 0).is_none(),
        "GTK >=3.24 required"
    );
    let context = gtk::glib::MainContext::default();
    let view = webkit2gtk::WebView::new();
    let window = gtk::Window::new(gtk::WindowType::Toplevel);
    window.add(&view);
    window.show_all();
    let loaded = Rc::new(Cell::new(false));
    let flag = loaded.clone();
    view.connect_load_changed(move |_, event| {
        if event == LoadEvent::Finished {
            flag.set(true);
        }
    });
    view.load_html("<!doctype html><title>Pending</title><body><script>document.title='Taro WebKit ready';document.body.dataset.ready='yes';</script>",Some("http://localhost/"));
    let deadline = Instant::now() + Duration::from_secs(30);
    while (!loaded.get() || view.title().as_deref() != Some("Taro WebKit ready"))
        && Instant::now() < deadline
    {
        context.iteration(false);
        std::thread::sleep(Duration::from_millis(10));
    }
    assert!(loaded.get(), "WebKit did not finish loading local HTML");
    assert_eq!(
        view.title().as_deref(),
        Some("Taro WebKit ready"),
        "WebKit JavaScript did not execute"
    );
    window.close();
}
