import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-px text-[11px] font-medium leading-4 transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-transparent text-muted-foreground",
        solid: "border-transparent bg-foreground text-background",
        subtle: "border-transparent bg-accent text-foreground",
        high: "border-destructive/30 bg-destructive/10 text-[#ff7b72]",
        medium: "border-warning/30 bg-warning/10 text-warning",
        low: "border-border bg-white/[0.03] text-muted-foreground",
        success: "border-success/30 bg-success/10 text-success",
        taro: "border-taro/30 bg-taro/10 text-taro",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
