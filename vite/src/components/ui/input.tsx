import * as React from "react";

import { cn } from "@/lib/utils";

interface InputProps extends React.ComponentProps<"input"> {
  startContent?: React.ReactNode;
  endContent?: React.ReactNode;
  variant?: "default" | "destructive";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, startContent, endContent, variant, ...props }, ref) => {
    const hasAdornment = startContent || endContent;
    const [isFocused, setIsFocused] = React.useState(false);

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);

    const gradientBg =
      "bg-[linear-gradient(180deg,white,theme(colors.stone.100))]";
    return (
      <>
        {hasAdornment ? (
          <div
            className={cn(
              `flex w-full rounded-md border border-input ${gradientBg} text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
              
              h-8 transition-colors duration-100 shadow-sm overflow-hidden
              `,
              isFocused &&
                `transition-colors duration-100 focus-visible:outline-none focus-visible:ring-0
               border-focus shadow-focus`,
              variant === "destructive" &&
                `focus-visible:border-red-400 focus-visible:shadow-[0_0_2px_1px_rgba(248,113,113,0.25)]`,
            )}
            data-disabled={props.disabled}
          >
            <input
              type={type}
              className={cn(
                `flex h-full w-full ${gradientBg} py-2 text-sm file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground shadow-none outline-none border-none focus-visible:outline-none focus-visible:border-none focus-visible:shadow-none
                [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
                
                p-2
                `,
                className,
              )}
              ref={ref}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...props}
            />
            <div className="flex items-center justify-center pr-2">
              {endContent}
            </div>
          </div>
        ) : (
          <input
            type={type}
            className={cn(
              `flex w-full rounded-md border border-zinc-200 bg-[linear-gradient(180deg,white,theme(colors.stone.50))] px-3 py-1 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-zinc-950 placeholder:text-zinc-500 disabled:cursor-not-allowed disabled:opacity-50
            md:text-sm dark:border-zinc-800 dark:file:text-zinc-50 dark:placeholder:text-zinc-400
            
            p-2 h-8 shadow-sm 
  
            duration-100 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-focus`,
              variant === "destructive"
                ? `focus-visible:border-red-400 focus-visible:shadow-[0_0_2px_1px_rgba(248,113,113,0.25)]`
                : `focus-visible:shadow-focus`,
              className,
            )}
            ref={ref}
            {...props}
          />
        )}
      </>
    );
  },
);
Input.displayName = "Input";

export { Input };
