import { type ButtonHTMLAttributes, type MouseEvent, useState } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "outline" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<void>;
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-black text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200",
  outline:
    "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-black dark:text-zinc-100 dark:hover:bg-zinc-900",
  ghost:
    "bg-transparent text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
};

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={cn("animate-spin", className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

export const Button = ({
  className,
  variant = "default",
  size = "md",
  loading: controlledLoading,
  disabled,
  onClick,
  children,
  ...props
}: ButtonProps) => {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = controlledLoading ?? internalLoading;

  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    if (!onClick || isLoading) return;
    const result = onClick(e);
    if (result instanceof Promise) {
      setInternalLoading(true);
      try {
        await result;
      } finally {
        setInternalLoading(false);
      }
    }
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
};
