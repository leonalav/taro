# Tauri desktop shell design

- **Intent:** Turn the existing React/Vite Taro preview into a runnable desktop app while retaining its custom title bar.
- **Approach:** Add a Tauri v2 shell around the current Vite frontend, with a transparent/custom-decorated window and native minimize, maximize/restore, and close actions wired from the existing title bar. Keep browser preview/dev behavior available and avoid changing product UI beyond the controls and required drag region.
- **Alternatives considered:** Native OS title bar (simpler, but user chose the custom bar); a separate desktop-only frontend (duplicates UI and behavior).
- **Constraints and non-goals:** Preserve the current React app and its mock data/flows. This adds desktop packaging and window controls, not backend agent capabilities or persistent project access.
- **Implementation choices left to the builder:** Tauri v2 defaults, sensible desktop window dimensions, and platform-safe maximize state handling. Verify the frontend build and Tauri configuration when the required local toolchain is available.
