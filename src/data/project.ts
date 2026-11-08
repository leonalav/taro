/* ------------------------------------------------------------------
 * Project file system browsed by the code Explorer panel.
 * ------------------------------------------------------------------ */

export type Lang = "css" | "tsx" | "ts" | "json" | "html" | "md" | "binary";

export interface ProjectFile {
  type: "file";
  name: string;
  path: string;
  lang: Lang;
  content: string;
}

export interface ProjectDir {
  type: "dir";
  name: string;
  path: string;
  children: ProjectNode[];
}

export type ProjectNode = ProjectFile | ProjectDir;

export const PROJECT_NAME = "taro";

const langOf = (name: string): Lang => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "css") return "css";
  if (ext === "tsx" || ext === "jsx") return "tsx";
  if (ext === "ts" || ext === "js" || ext === "mjs") return "ts";
  if (ext === "json") return "json";
  if (ext === "html") return "html";
  if (ext === "md") return "md";
  return "binary";
};

type Spec = { dir: string; children: Spec[] } | { file: string; content?: string };

const d = (dir: string, children: Spec[]): Spec => ({ dir, children });
const f = (file: string, content = ""): Spec => ({ file, content });

function build(specs: Spec[], parent = ""): ProjectNode[] {
  const nodes = specs.map((spec): ProjectNode => {
    if ("dir" in spec) {
      const path = parent ? `${parent}/${spec.dir}` : spec.dir;
      return { type: "dir", name: spec.dir, path, children: build(spec.children, path) };
    }
    const path = parent ? `${parent}/${spec.file}` : spec.file;
    return { type: "file", name: spec.file, path, lang: langOf(spec.file), content: spec.content ?? "" };
  });
  // Directories first, then files — each alphabetically.
  return nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

/* ------------------------------------------------------------------
 * File contents
 * ------------------------------------------------------------------ */

const INDEX_CSS = `@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/*
  Taro — design tokens.

  A calm, near-neutral system for a design-first coding agent.
  Everything below is expressed in OKLCH so lightness steps are
  perceptually even. The palette is deliberately small: graphite
  neutrals, one
  brass signal accent, mono used only for real data, and structural rules.

  Dark is the default because Taro is a tool people open next to a code
  editor. The light theme is a true light theme, not an inverted dark one:
  the canvas goes to a true off-white at zero chroma, the accent darkens so
  it still clears AA on light, and the structural rules invert cleanly.
*/

/* ---------------------------------------------------------------- */
/* Dark — the default. Every value here is the source of truth.     */
/* ---------------------------------------------------------------- */
:root,
.dark {
  --radius: 0.5rem;

  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.187 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.8 0.115 72);
  --primary-foreground: oklch(0.18 0.012 72);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.245 0 0);
  --muted-foreground: oklch(0.678 0 0);
  --accent: oklch(0.278 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.662 0.17 24);
  --border: oklch(1 0 0 / 9%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.8 0.115 72 / 55%);

  /* Taro extensions */
  --signal: oklch(0.8 0.115 72);
  --signal-foreground: oklch(0.18 0.012 72);
  --signal-quiet: oklch(0.8 0.115 72 / 14%);
  --measure: oklch(0.74 0.085 208);
  --positive: oklch(0.74 0.105 158);
  --negative: oklch(0.662 0.17 24);
  --rule: oklch(1 0 0 / 12%);
  --rule-strong: oklch(1 0 0 / 20%);
  --surface-1: oklch(0.187 0 0);
  --surface-2: oklch(0.222 0 0);
  --surface-3: oklch(0.262 0 0);
}

/* ---------------------------------------------------------------- */
/* Light — a true light theme, tuned rather than inverted.          */
/* ---------------------------------------------------------------- */
.light {
  --background: oklch(0.985 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --primary: oklch(0.58 0.12 66);
  --primary-foreground: oklch(0.985 0 0);
  --border: oklch(0 0 0 / 9%);
  --ring: oklch(0.58 0.12 66 / 50%);
  --signal: oklch(0.58 0.12 66);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: "ss01", "cv11";
  }
}
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./app/app";

// Taro boots straight into the last open workspace.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;

const APP_TSX = `import { Shell } from "@/components/shell";
import { Canvas } from "@/features/canvas/canvas";
import { useWorkspace } from "@/lib/workspace";

export function App() {
  const workspace = useWorkspace();

  return (
    <Shell workspace={workspace}>
      <Canvas frame="discovery" variant="B" />
    </Shell>
  );
}
`;

const PROVIDERS_TSX = `import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";

export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider defaultTheme="dark">{children}</ThemeProvider>;
}
`;

const BUTTON_TSX = `import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: { default: "h-9 px-4", sm: "h-8 px-3", icon: "size-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;
`;

const SHELL_TSX = `import type { ReactNode } from "react";
import type { Workspace } from "@/lib/workspace";

export function Shell({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-64 border-r border-border">{workspace.name}</aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
`;

const CANVAS_TSX = `import { useFrame } from "./use-frame";

export function Canvas({ frame, variant }: { frame: string; variant: "A" | "B" }) {
  const { layers, score } = useFrame(frame, variant);

  return (
    <section aria-label={\`\${frame} · variant \${variant}\`}>
      {layers.map((layer) => (
        <div key={layer.id} style={layer.style} />
      ))}
      <output>{score}</output>
    </section>
  );
}
`;

const USE_FRAME_TS = `export function useFrame(frame: string, variant: "A" | "B") {
  // Frames are resolved from the design source of truth, never from code.
  const layers = [] as { id: string; style: React.CSSProperties }[];
  return { layers, score: 92, frame, variant };
}
`;

const UTILS_TS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

const WORKSPACE_TS = `export interface Workspace {
  id: string;
  name: string;
  branch: string;
}

export function useWorkspace(): Workspace {
  return { id: "taro", name: "taro", branch: "main" };
}
`;

const THEME_TSX = `import { createContext, type ReactNode } from "react";

const ThemeContext = createContext<"dark" | "light">("dark");

export function ThemeProvider({ defaultTheme, children }: { defaultTheme: "dark" | "light"; children: ReactNode }) {
  return <ThemeContext.Provider value={defaultTheme}>{children}</ThemeContext.Provider>;
}
`;

const COMPONENTS_JSON = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
`;

const INDEX_HTML = `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.svg" />
    <title>Taro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const PACKAGE_JSON = `{
  "name": "taro",
  "private": true,
  "version": "0.4.2",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwind-merge": "^3.4.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.17",
    "tailwindcss": "^4.1.17",
    "typescript": "^5.9.3",
    "vite": "^7.3.0"
  }
}
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
`;

const README_MD = `# Taro

A design-first coding agent. Designs are the source of truth;
code is generated only after a design is approved.

## Scripts

- \`pnpm dev\` — start the app
- \`pnpm build\` — production build
`;

/* ------------------------------------------------------------------
 * Tree
 * ------------------------------------------------------------------ */

export const projectTree: ProjectNode[] = build([
  d("node_modules", [d("react", [f("package.json", `{ "name": "react", "version": "19.2.0" }\n`)]), d("vite", [])]),
  d("public", [f("favicon.svg"), f("og.png")]),
  d("src", [
    d("app", [f("app.tsx", APP_TSX), f("providers.tsx", PROVIDERS_TSX)]),
    d("components", [d("ui", [f("button.tsx", BUTTON_TSX)]), f("shell.tsx", SHELL_TSX)]),
    d("features", [d("canvas", [f("canvas.tsx", CANVAS_TSX), f("use-frame.ts", USE_FRAME_TS)])]),
    d("lib", [f("theme.tsx", THEME_TSX), f("utils.ts", UTILS_TS), f("workspace.ts", WORKSPACE_TS)]),
    f("index.css", INDEX_CSS),
    f("main.tsx", MAIN_TSX),
  ]),
  f("components.json", COMPONENTS_JSON),
  f("index.html", INDEX_HTML),
  f("package.json", PACKAGE_JSON),
  f("README.md", README_MD),
  f("tsconfig.json", TSCONFIG_JSON),
]);

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

export function allFiles(nodes: ProjectNode[] = projectTree): ProjectFile[] {
  return nodes.flatMap((n) => (n.type === "file" ? [n] : allFiles(n.children)));
}

export function findNode(path: string, nodes: ProjectNode[] = projectTree): ProjectNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.type === "dir" && path.startsWith(n.path + "/")) {
      const hit = findNode(path, n.children);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** "src/app/app.tsx" → ["src", "src/app"] */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}
