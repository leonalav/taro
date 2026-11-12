# Reception page

Taro starts on a welcome page following the supplied desktop reference: native window controls and brand bar, a centered welcome/composer area, saved work, project starters, quick actions and footer navigation. The existing editor stays mounted while hidden. Its titlebar Home button returns to reception without interrupting running work. The welcome composer also stays mounted, preserving unsent text and attachments; its background animation stops while hidden.

## Actions

- Recent work comes from active saved chats in existing folders, ordered by relative activity labels. Resume selects the actual chat and opens the editor. No sample recent projects are invented to fill the layout.
- The starting composer reuses normal attachments, mentions, skills, permissions and effort controls. Submission creates a fresh chat in the selected workspace before invoking the existing runtime. The old reference chat is not overwritten.
- New project asks for a name and parent directory, creates the folder through the existing native command and opens Explorer.
- Open project uses the native folder picker, reuses an existing workspace when possible and opens Explorer. Cancelling a picker stays on reception.
- Templates are editable starting briefs for a web app, landing page or brand discovery. They do not claim to create template files.
- GitHub import accepts an exact HTTPS GitHub repository URL and a destination parent. It runs a quoted `git clone --` through the existing native shell boundary with a ten-minute limit. Cancellation stops the native request; partial clone files are retained rather than deleted automatically. No remote clone is necessary for automated tests.
- Projects, search and command palette open the existing global picker; selecting a result enters the editor. Ctrl+O opens a project; Ctrl+K and Ctrl+Shift+P open the picker; Ctrl+, opens Settings.
- Docs and What's new provide local product guidance. Settings and account use the existing settings dialog. Notifications accurately show an empty state.

## Visual implementation

The page follows the supplied workspace-wireframe reference: a rounded application frame with a left icon rail, a canvas with a breadcrumb/search bar, a wide hero panel, a saved-work rail on the right, and a bottom row of three action cards. The hero keeps Taro's serif welcome lockup and violet accent, while frame chrome, status pills, sections and shortcuts use Geist Mono metadata so the welcome surface reads as the same product as the Explore/Sessions sidebar and the inline artifact sheets.

Geist typography, Taro's existing mark, flat #0b0b0b surfaces, #1f1f25 borders, violet accents and the current icon libraries remain authoritative. Panels use tonal contrast rather than glow or blurred backdrops, and the composer keeps its native surfaces so mentions, permissions and attachments stay legible. Layouts stack at 1240 px (single column), 820 px (rail-first mobile) and 560 px (single-column tiles); the page, not the panels, owns vertical scrolling so composer popovers are never clipped. OS and application reduced-motion preferences disable the frame's transitions. New project and import dialogs preserve input focus across field updates and prevent stale asynchronous responses from updating another dialog.

WCAG 2.2: every shortcut, recent project, template and footer action is a native button with an accessible name, visible 2 px focus ring, and a target of at least 24×24 px (most are 28–40 px). Section headings form an h1 → h2 outline, decorative marks and glyphs are hidden, muted text stays at or above 4.5:1 on the panel surfaces, and status is never conveyed by color alone. The rail scrolls at short viewport heights instead of clipping its actions.

Saved previews: `docs/previews/reception.png` (1672×941) and `docs/previews/reception-narrow.png` (480 px). Browser checks confirmed editable template insertion and navigation from a saved project into the IDE. Integration tests exercise primary-model prompt handoff, draft retention, dialog focus, callbacks, GitHub URL validation and the rail/heading accessibility contract. An axe-core audit (WCAG 2.0/2.1/2.2 A and AA plus best-practice rules) reports zero violations on the welcome page at 1560 and 760 px, and on the chat surface with the Explorer panel open and tool rows expanded.
