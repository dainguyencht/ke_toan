import * as React from "react";
import { cn } from "@/lib/utils";

interface Props extends React.HTMLAttributes<HTMLElement> {
  title: string;
  children: React.ReactNode;
}

/**
 * Hiển thị từ viết tắt với gạch chân đứt + tooltip giải nghĩa khi hover.
 * Dùng cho SKU, NCC, KH, SL, TB, ... trong UI.
 */
export function Abbr({ title, children, className, ...props }: Props) {
  return (
    <abbr
      title={title}
      className={cn(
        "cursor-help no-underline border-b border-dotted border-neutral-400",
        className,
      )}
      {...props}
    >
      {children}
    </abbr>
  );
}
