# ThoughtLine integration

Replace the generic agent thinking placeholder and legacy completed trace disclosure with the supplied React Bits ThoughtLine. Use `glyph="dot"` per the user's correction. Retain the supplied Motion breathing/shimmer/settle behavior and Hugeicons chevron/check marks; do not import a sparkle icon.

Use one typed `thought` message per live generation. It remains visible across tool rounds, receives only observable model/tool/permission status summaries, and settles to completed, stopped, or failed. Store start time and frozen duration; controlled elapsed time keeps remounts accurate. Recovered in-progress messages settle as interrupted instead of running indefinitely after reopening the app. Existing agent trace summaries render as settled ThoughtLine instances.

Preserve streaming text, sparse tool group placement, permissions, and stop behavior. Do not consume or expose model reasoning. Native and browser preview paths use the same progress format. Use inherited Geist typography and muted text at 13px. Traces wrap in narrow panels, toggles have focus/ARIA state, and reduced-motion settings suppress shimmer and breathing.

Verify placeholder replacement, timer freezing/restarts, controlled elapsed time, one settle callback per transition, trace collapse/reopening, run-state transitions, persistence recovery, and integration with the existing model/tool loop. Run full tests, TypeScript, build, and one browser inspection pass.
