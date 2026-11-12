import type { ChipRef } from "@/data/mentions";
import { chipIcon } from "@/data/mentions";
import { FileIcon } from "@/components/explorer-panel";
import { Film } from "lucide-react";
import { cn } from "@/utils/cn";

const chipStyles = {
  file: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  mcp: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  skill: "border-[#5a564d] bg-white/[0.07] text-[#efe9dc]",
  artifact: "border-[#423f37] bg-[#1b1a17] text-[#e6e0d4]",
  comment: "border-amber-500/40 bg-amber-500/10 text-amber-300",
} as const;

/**
 * Inline mention chip. Used inside the composer editor and inside
 * rendered user messages, so both stay visually identical.
 */
export function MentionChip({
  chip,
  className,
  removable,
  onRemove,
}: {
  chip: ChipRef;
  className?: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  const Icon = chip.artifact?.source === "media" ? Film : chipIcon[chip.kind];
  const isComment = chip.kind === "comment";
  const commentLabel = chip.comment
    ? chip.comment.mode === "group"
      ? "Comments"
      : "Comment"
    : chip.label;
  const reference = chip.artifact;
  const typeLabel = reference?.type === "video"
    ? "Video"
    : reference?.type === "skeleton"
      ? "Skeleton"
      : reference?.type === "prototype"
        ? "Prototype"
        : "Design";

  return (
    <span
      data-chip={chip.id}
      data-chip-kind={chip.kind}
      data-chip-value={JSON.stringify(chip)}
      contentEditable={false}
      title={chip.description ?? chip.label}
      className={cn(
        "mx-px inline-flex items-center gap-1 rounded-md border px-1.5 align-baseline text-[12px] leading-[18px] font-medium",
        isComment && "gap-1.5 rounded-full py-0.5 align-middle",
        chipStyles[chip.kind],
        chip.kind === "artifact" && "gap-1.5 py-0.5 align-middle",
        className
      )}
    >
      {reference?.background || reference?.poster ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-[3px] bg-cover bg-center ring-1 ring-inset ring-white/10"
          style={{
            background: reference.background,
            backgroundImage: reference.poster ? `url(${JSON.stringify(reference.poster)})` : reference.background,
          }}
        />
      ) : chip.kind === "file" ? <FileIcon name={chip.label} className="size-3"/> : (
        <Icon className="size-3 shrink-0 self-center" strokeWidth={2} />
      )}
      {isComment ? (
        <>
          <span className="font-medium text-amber-100">{commentLabel}</span>
          <span className="text-amber-400/60">·</span>
          <span className="font-mono text-[11px] font-normal text-amber-200/80">
            {chip.comment?.mode === "group" ? "Design Plan" : chip.comment?.lines ?? chip.label.replace(/^Comment · /, "")}
          </span>
          {chip.comment && chip.comment.mode === "group" && (
            <span className="ml-0.5 rounded-full bg-amber-400/20 px-1 text-[10px] font-normal text-amber-200">{chip.comment.count}</span>
          )}
        </>
      ) : (
        <>
          <span className="max-w-[180px] truncate">{chip.kind === "skill" ? `/${chip.label}` : chip.label}</span>
          {chip.kind === "artifact" && <span className="text-[10px] font-normal text-[#a99ab8]">{typeLabel}</span>}
        </>
      )}
      {removable && (
        <button
          type="button"
          contentEditable={false}
          data-remove-chip="true"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          aria-label={`Remove ${chip.label}`}
          className="ml-0.5 shrink-0 self-center rounded-sm opacity-60 transition-opacity hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth={3}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
