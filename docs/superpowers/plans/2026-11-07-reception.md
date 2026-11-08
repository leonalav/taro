# Reception page

Build the supplied welcome layout in Taro's existing dark/purple visual system. The reference fixes the composition: branded native titlebar, welcome hero and real Composer, prompt shortcuts, recent work, project starters, quick actions and quiet footer. Purple light arcs use CSS geometry with a subtle GSAP motion layer; reduced motion remains static.

Use saved chats/workspaces for recents. Resume opens the selected chat; prompt submission creates a new chat before calling the existing runtime. Open/New project use native directory selection/creation. GitHub import asks for an HTTPS repository and destination, then runs the existing approved native shell boundary with errors and cancellation. Templates supply editable starting briefs. Search, settings and the command palette route into existing application features. Keep editor state when returning to reception.

Verify navigation, prompt handoff and project operations, then inspect desktop and narrow layouts in one bounded browser pass. Run relevant tests, TypeScript and frontend/native builds.

Implemented and visually verified. Independent integration review identified dialog focus resets and lost unsent reception drafts; both were corrected and the reviewer confirmed both findings resolved. Focused regressions pass. Behavior and limitations are recorded in `docs/reception.md`.

Final verification: 40 Taro test files / 122 tests passed (reference checkouts excluded), TypeScript passed, production Vite build passed, and desktop Cargo build passed. Browser checks confirmed the reference-size and narrow layouts, editable template insertion, and recent-project navigation into the IDE. No real remote AI call or GitHub clone was used for verification.
