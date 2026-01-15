/* eslint-disable react-refresh/only-export-components */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import SmallSpinner from "@/components/general/SmallSpinner";
import { cn } from "@/lib/utils";

// hover:border-primary
// focus-visible:bg-active-primary focus-visible:border-primary
// active:bg-active-primary active:border-primary

// Remove ring styles
// focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive
const buttonVariants = cva(
	`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none 
  rounded-lg group/btn transition-none w-fit
  `,
	{
		variants: {
			variant: {
				// Custom
				primary: `btn-primary-shadow !text-primary-foreground bg-primary border border-transparent hover:bg-primary-btn-hover 
        active:bg-primary-btn-active active:border-primary-btn-border
				focus-visible:bg-primary-btn-active focus-visible:border-primary-btn-border

				btn-primary-dark
				`,

				secondary: `bg-interactive-secondary border border-[var(--color-input)] hover:bg-interactive-secondary-hover active:bg-interactive-secondary-hover btn-secondary-shadow
				focus-visible:bg-active-primary focus-visible:border-primary text-t1
			
				`,

				skeleton: `border border-transparent hover:text-primary!
				 focus-visible:border-primary
				active:bg-interactive-secondary-hover active:border-primary`,

				muted: `bg-muted hover:bg-interactive-secondary-hover border border-transparent
				 focus-visible:border-primary hover:interactive-secondary-hover
				active:bg-interactive-secondary-hover
				`,

				destructive: `bg-destructive !text-primary-foreground border-[1.2px] border-transparent
					hover:bg-destructive-hover btn-destructive-shadow
					focus-visible:border-destructive-border
					active:border-destructive-border
					`,

				dotted: `bg-white border border-dashed border-neutral-300 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.02)]
					hover:border-primary hover:border-solid
					focus-visible:border-primary focus-visible:border-solid
					active:border-primary active:border-solid
					`,
			},
			size: {
				default: "py-1 !px-[7px] text-body h-input",
				sm: "py-1 !px-[7px] text-tiny h-6",
				mini: "py-1 !px-1.5 text-sm h-6",
				icon: "p-1 h-6 text-xs",
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
	transition?: boolean;
	disableActive?: boolean;
	hide?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant,
			size,
			asChild = false,
			isLoading = false,
			transition = false,
			disableActive = true,
			hide = false,
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

		const getDisableActiveStyles = () => {
			if (!disableActive) return "";

			switch (variant) {
				case "primary":
					return "active:!bg-primary active:!border-transparent focus-visible:!bg-primary focus-visible:!border-transparent";

				case "secondary":
					return "active:!bg-interactive-secondary-hover active:!border-[var(--color-input)] focus-visible:!bg-interactive-secondary-hover focus-visible:!border-[var(--color-input)]";

				case "skeleton":
					return "active:!bg-transparent active:!border-transparent focus-visible:!bg-transparent focus-visible:!border-transparent";

				case "muted":
					return "active:!bg-interactive-secondary-hover active:!border-transparent focus-visible:!bg-interactive-secondary-hover focus-visible:!border-transparent";

				case "destructive":
					return "active:!bg-destructive active:!border-transparent focus-visible:!bg-destructive focus-visible:!border-transparent";

				case "dotted":
					return "active:!bg-white active:!border-dashed active:!border-neutral-300 focus-visible:!bg-white focus-visible:!border-dashed focus-visible:!border-neutral-300";

				default:
					return "";
			}
		};

		if (hide) return null;

		return (
			<Comp
				ref={buttonRef}
				data-slot="button"
				className={cn(
					buttonVariants({ variant, size, className }),
					getDisableActiveStyles(),
					// transition && "transition-all duration-150",
				)}
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
