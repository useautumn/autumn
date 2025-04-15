import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { LoaderCircle } from "lucide-react";

// [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-zinc-300 font-regular
  
  `,
  {
    variants: {
      variant: {
        default:
          // "bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90",
          "bg-primary hover:bg-primary/90 text-zinc-50 shadow dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90",
        secondary:
          "border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        // "bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-100/80 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/80",
        destructive:
          "font-semibold text-red-400 border border-red-400 shadow-sm hover:bg-red-500/90 hover:text-zinc-50 dark:bg-red-900 dark:text-zinc-50 dark:hover:bg-red-900/90",
        // destructive:
        //   "bg-red-500 font-semibold text-zinc-50 shadow-sm hover:bg-red-500/90 dark:bg-red-900 dark:text-zinc-50 dark:hover:bg-red-900/90",
        outline:
          "border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        ghost:
          "hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        link: "text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50",
        dashed:
          "font-semibold border border-1 border-dashed bg-gradient-to-b from-white to-stone-100 border-stone-300 text-primary shadow-sm hover:from-stone-100 hover:to-stone-200 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        gradientPrimary:
          "bg-gradient-to-b font-semibold border border-primary from-primary/65 to-primary text-white hover:from-primary hover:to-primary shadow-sm shadow-purple-500/50 transition-[background] duration-300",

        gradientSecondary:
          "border border-stone-300 font-semibold bg-gradient-to-b from-white to-stone-100 text-t1 hover:from-stone-300 hover:to-stone-400 shadow-sm transition-[background] duration-300",
      },
      size: {
        default: "h-8 px-3 flex items-center gap-1",
        sm: "h-7 rounded-md px-2 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  isIcon?: boolean;
  dim?: number;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      isIcon = false,
      dim = 7,
      startIcon,
      endIcon,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        {...props}
        className={cn(
          buttonVariants({ variant, size, className }),
          isIcon && `w-${dim} h-${dim} p-0`
        )}
        ref={ref}
        onClick={(e) => {
          if (isLoading) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          props.onClick?.(e);
        }}
      >
        {isLoading && <LoaderCircle className="animate-spin" size={20} />}
        {startIcon && !isLoading && <>{startIcon}</>}
        {children}
        {endIcon && !isLoading && <>{endIcon}</>}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
