/* eslint-disable react-refresh/only-export-components */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-none
  
  rounded-lg group/btn
  `,
	{
		variants: {
			variant: {
				// Custom
				primary: `btn-primary-shadow !text-white bg-primary border border-transparent hover:bg-primary-btn-hover 
        focus:bg-primary-btn-active focus:border-primary-btn-border`,

				secondary:
					"bg-white border border-input hover:border-primary hover:bg-hover-primary focus:bg-active-primary focus:border-primary btn-secondary-shadow",

				ghost:
					"hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
			},
			size: {
				default: "py-1 !px-[7px] text-body has-[>svg]:px-3",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
	isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			asChild = false,
			isLoading = false,
			children,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : "button";
		const buttonRef = React.useRef<HTMLButtonElement>(null);
		const [contentWidth, setContentWidth] = React.useState<number | null>(null);

		// Combine refs using useImperativeHandle
		React.useImperativeHandle(
			ref,
			() => buttonRef.current as HTMLButtonElement,
			[],
		);

		React.useEffect(() => {
			if (buttonRef.current && !isLoading) {
				// Measure the full button width including padding
				const width = buttonRef.current.offsetWidth;
				setContentWidth(width);
			}
		}, [isLoading]);

		// Measure width on mount and when loading state changes
		React.useEffect(() => {
			if (buttonRef.current && !isLoading) {
				// Use requestAnimationFrame to ensure DOM is fully rendered
				requestAnimationFrame(() => {
					if (buttonRef.current) {
						const width = buttonRef.current.offsetWidth;
						setContentWidth(width);
					}
				});
			}
		}, [isLoading]);

		return (
			<Comp
				ref={buttonRef}
				data-slot="button"
				className={cn(buttonVariants({ variant, size, className }))}
				style={{
					minWidth:
						isLoading && contentWidth
							? `${contentWidth + 0.2}px` // Add small buffer to prevent any slight width changes
							: undefined,
				}}
				disabled={isLoading || props.disabled}
				{...props}
			>
				{isLoading ? <SmallSpinner size={14} /> : children}
			</Comp>
		);
	},
);

Button.displayName = "Button";

export { Button, buttonVariants };

// destructive:
// 	"bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
// outline:
// 	"border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
// secondary:
// 	"bg-secondary text-secondary-foreground hover:bg-secondary/80",

// link: "text-primary underline-offset-4 hover:underline",

// sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
// lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
// icon: "size-9",
