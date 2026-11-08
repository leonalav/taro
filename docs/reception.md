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

Geist typography, Taro's existing mark, dark surfaces, violet accents and current icon libraries remain authoritative. The user-supplied React Bits AcidSquares component now renders the WebGL background with its specified dark squares, pink/blue split lighting, waves and pointer interaction. It replaces the original CSS arcs and GSAP motion. A dark scrim and panel surfaces preserve text contrast. OS and application reduced-motion preferences use a settled static frame; hiding reception pauses the effect. Unsupported WebGL falls back to the dark page surface. Layouts stack on narrow screens, retain visible keyboard focus, and keep project errors visible. New project and import dialogs preserve input focus across field updates and prevent stale asynchronous responses from updating another dialog.

Verified at the supplied 1672×941 reference size and at a 480-pixel width. Saved previews: `docs/previews/reception.png` and `docs/previews/reception-narrow.png`. Browser checks confirmed editable template insertion and navigation from a saved project into the IDE. Integration tests exercise primary-model prompt handoff, draft retention, dialog focus, callbacks and GitHub URL validation.
