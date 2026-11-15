import * as React from "react";
import { cn } from "@/utils/cn";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-taro/50 focus-visible:ring-2 focus-visible:ring-taro/20 disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
