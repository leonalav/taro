import { cn } from "@/utils/cn";

type AvatarTone = "taro" | "neutral" | "ocean" | "sunset";
type AvatarSize = "sm" | "md" | "lg";

interface AvatarProps {
  initials: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  className?: string;
}

const sizes: Record<AvatarSize, string> = {
  sm: "size-5 text-[9px]",
  md: "size-7 text-[11px]",
  lg: "size-8 text-xs",
};

const tones: Record<AvatarTone, string> = {
  taro: "bg-gradient-to-br from-violet-300 via-violet-500 to-fuchsia-600",
  neutral: "bg-gradient-to-br from-zinc-500 to-zinc-800",
  ocean: "bg-gradient-to-br from-sky-300 to-indigo-600",
  sunset: "bg-gradient-to-br from-amber-200 via-orange-400 to-rose-500",
};

function Avatar({ initials, size = "md", tone = "neutral", className }: AvatarProps) {
  return (
    <span
      data-slot="avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-tight text-white ring-1 ring-inset ring-white/10",
        sizes[size],
        tones[tone],
        className
      )}
    >
      {initials}
    </span>
  );
}

export { Avatar };
