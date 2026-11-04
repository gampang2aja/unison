import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost" | "destructive" | "spotify";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

    const variantStyles = {
      default:
        "bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-600 hover:shadow-violet-500/30",
      secondary:
        "bg-zinc-800 text-zinc-100 border border-zinc-700/60 hover:bg-zinc-750 hover:border-zinc-600",
      outline:
        "border border-zinc-800 bg-transparent text-zinc-200 hover:bg-zinc-900/80 hover:border-zinc-700",
      ghost:
        "text-zinc-300 hover:bg-zinc-800/60 hover:text-white",
      destructive:
        "bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20",
      spotify:
        "bg-[#1DB954] text-black font-semibold hover:bg-[#1ed760] shadow-lg shadow-[#1DB954]/25",
    };

    const sizeStyles = {
      default: "h-11 px-5 py-2.5",
      sm: "h-9 rounded-lg px-3 text-xs",
      lg: "h-13 rounded-2xl px-8 text-base",
      icon: "h-10 w-10 p-0",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

