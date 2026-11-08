import * as React from "react";
import type { Lang } from "@/data/project";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------
 * Tokenizer — small, line-based, good enough for reading code.
 * ------------------------------------------------------------------ */

type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "number"
  | "property"
  | "variable"
  | "color"
  | "atrule"
  | "tag"
  | "punct";

export interface Token {
  text: string;
  kind: TokenKind;
}

const tokenClass: Record<TokenKind, string> = {
  plain: "text-[#d6d6d6]",
  comment: "italic text-[#7a7a7a]",
  string: "text-[#a5d6a7]",
  keyword: "text-[#c4a7ff]",
  number: "text-[#f0b37e]",
  property: "text-[#b9c2cc]",
  variable: "text-[#e6e6e6]",
  color: "text-[#f0b37e]",
  atrule: "text-[#c4a7ff]",
  tag: "text-[#8cc8ff]",
  punct: "text-[#8f8f8f]",
};

const CSS_RE =
  /(\/\*.*?\*\/)|(\/\*.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|(--[\w-]+)|(oklch\([^)]*\)|rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-fA-F]{3,8}\b)|(@[\w-]+)|([a-z-]+)(?=\s*:\s)|(-?\d*\.?\d+(?:rem|px|em|%|ms|s|deg|fr|vh|vw)?)|([{}();,:])/g;

const CODE_RE =
  /(\/\/.*$|\/\*.*?\*\/|<!--.*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|const|let|var|function|return|if|else|type|interface|extends|as|new|typeof|true|false|null|undefined)\b|(<\/?[A-Za-z][\w.-]*|\/?>)|(\b\d+(?:\.\d+)?\b)|([{}()[\];,.:=])/g;

/** Tokenize a whole file into lines of tokens, carrying block-comment state across lines. */
export function tokenize(source: string, lang: Lang): Token[][] {
  const lines = source.replace(/\n$/, "").split("\n");
  if (lang === "md" || lang === "binary") return lines.map((text) => [{ text, kind: "plain" }]);

  let inComment = false;

  return lines.map((line) => {
    const tokens: Token[] = [];
    let rest = line;

    if (inComment) {
      const end = rest.indexOf("*/");
      if (end === -1) return [{ text: rest, kind: "comment" }];
      tokens.push({ text: rest.slice(0, end + 2), kind: "comment" });
      rest = rest.slice(end + 2);
      inComment = false;
    }

    const re = new RegExp(lang === "css" ? CSS_RE.source : CODE_RE.source, "g");
    let last = 0;
    let m: RegExpExecArray | null;

    while ((m = re.exec(rest))) {
      if (m.index > last) tokens.push({ text: rest.slice(last, m.index), kind: "plain" });
      const text = m[0];
      let kind: TokenKind = "plain";

      if (lang === "css") {
        if (m[1]) kind = "comment";
        else if (m[2]) {
          kind = "comment";
          inComment = true;
        } else if (m[3]) kind = "string";
        else if (m[4]) kind = "variable";
        else if (m[5]) kind = "color";
        else if (m[6]) kind = "atrule";
        else if (m[7]) kind = "property";
        else if (m[8]) kind = "number";
        else if (m[9]) kind = "punct";
      } else {
        if (m[1]) kind = "comment";
        else if (m[2]) kind = lang === "json" && /^\s*:/.test(rest.slice(re.lastIndex)) ? "property" : "string";
        else if (m[3]) kind = "keyword";
        else if (m[4]) kind = "tag";
        else if (m[5]) kind = "number";
        else if (m[6]) kind = "punct";
      }

      tokens.push({ text, kind });
      last = re.lastIndex;
      if (text.length === 0) re.lastIndex++;
    }

    if (last < rest.length) tokens.push({ text: rest.slice(last), kind: "plain" });
    return tokens.length ? tokens : [{ text: "", kind: "plain" }];
  });
}

/* ------------------------------------------------------------------
 * View
 * ------------------------------------------------------------------ */

interface CodeViewProps {
  source: string;
  lang: Lang;
  query?: string;
  className?: string;
}

export function CodeView({ source, lang, query = "", className }: CodeViewProps) {
  const lines = React.useMemo(() => tokenize(source, lang), [source, lang]);
  const q = query.trim().toLowerCase();
  const rawLines = React.useMemo(() => source.replace(/\n$/, "").split("\n"), [source]);
  const firstMatchRef = React.useRef<HTMLDivElement>(null);

  const matchCount = q ? rawLines.filter((l) => l.toLowerCase().includes(q)).length : 0;
  const firstMatch = q ? rawLines.findIndex((l) => l.toLowerCase().includes(q)) : -1;

  React.useEffect(() => {
    firstMatchRef.current?.scrollIntoView({ block: "center" });
  }, [q]);

  return (
    <div className={cn("relative font-mono text-[12.5px] leading-[22px]", className)}>
      {q && (
        <span className="sticky top-2 z-10 float-right mr-4 rounded-md border border-border bg-popover px-2 py-0.5 font-sans text-[11px] text-muted-foreground">
          {matchCount} {matchCount === 1 ? "match" : "matches"}
        </span>
      )}
      {lines.map((tokens, i) => {
        const isMatch = q && rawLines[i].toLowerCase().includes(q);
        return (
          <div
            key={i}
            ref={i === firstMatch ? firstMatchRef : undefined}
            className={cn("flex", isMatch && "bg-warning/[0.08]")}
          >
            <span className="sticky left-0 w-14 shrink-0 bg-inherit pr-5 text-right text-[#5c5c5c] select-none">
              {i + 1}
            </span>
            <span className="pr-6 whitespace-pre">
              {tokens.map((token, j) =>
                token.kind === "color" ? (
                  <span key={j} className={tokenClass.color}>
                    <span
                      aria-hidden="true"
                      className="mr-1 inline-block size-[10px] translate-y-[1px] rounded-[2px] ring-1 ring-white/40"
                      style={{ background: token.text }}
                    />
                    {token.text}
                  </span>
                ) : (
                  <span key={j} className={tokenClass[token.kind]}>
                    {token.text}
                  </span>
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
