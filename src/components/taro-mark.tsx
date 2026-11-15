import { cn } from "@/utils/cn";

/** Stacked-blocks mark for Taro. Uses currentColor so it can be tinted. */
export function TaroMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-5", className)}
    >
      <rect x="2.5" y="2.5" width="10" height="10" rx="3" fill="currentColor" opacity="0.35" />
      <rect x="11.5" y="6.5" width="10" height="10" rx="3" fill="currentColor" opacity="0.6" />
      <rect x="5.5" y="11.5" width="10" height="10" rx="3" fill="currentColor" />
    </svg>
  );
}

/** Tinted tile holding the Taro mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#241a33] ring-1 ring-inset ring-[#3a2d4d]",
        className
      )}
    >
      <TaroMark className="size-4 text-[#c9a8ff]" />
    </div>
  );
}
