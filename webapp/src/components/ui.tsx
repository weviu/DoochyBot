import { Loader2 } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { haptic } from "../lib/telegram";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 " +
  "focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface border border-hairline text-fg hover:bg-surface-hover hover:border-hairline-strong",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
  danger: "text-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  // When set, the button shows a spinner + disabled state for >=400ms so a fast
  // async action never flickers.
  onClickAsync?: () => Promise<void>;
}

export function Button({
  variant = "secondary",
  size = "md",
  onClickAsync,
  onClick,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handle(e: React.MouseEvent<HTMLButtonElement>) {
    haptic("light");
    if (onClickAsync) {
      setLoading(true);
      const started = Date.now();
      try {
        await onClickAsync();
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed < 400) await new Promise((r) => setTimeout(r, 400 - elapsed));
        setLoading(false);
      }
    } else {
      onClick?.(e);
    }
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={handle}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border border-hairline bg-surface shadow-card " +
        (interactive ? "transition hover:bg-surface-hover hover:border-hairline-strong cursor-pointer " : "") +
        className
      }
    >
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-hover ${className}`} />;
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "danger" | "accent";
}) {
  const tones: Record<string, string> = {
    muted: "border-hairline bg-surface text-fg-muted",
    success: "border-success/30 bg-success-soft text-success",
    danger: "border-danger/30 bg-danger-soft text-danger",
    accent: "border-accent/20 bg-accent-soft text-accent",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
