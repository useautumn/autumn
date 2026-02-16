import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
	"au-inline-flex au-items-center au-justify-center au-gap-2 au-whitespace-nowrap au-rounded-md au-text-sm au-font-medium au-transition-colors focus-visible:au-outline-none focus-visible:au-ring-1 focus-visible:au-ring-ring disabled:au-pointer-events-none disabled:au-opacity-50 [&_svg]:au-pointer-events-none [&_svg]:au-size-4 [&_svg]:au-shrink-0",
	{
		variants: {
			variant: {
				default:
					"au-bg-primary au-text-primary-foreground au-shadow hover:au-bg-primary/90",
				destructive:
					"au-bg-destructive au-text-destructive-foreground au-shadow-sm hover:au-bg-destructive/90",
				outline:
					"au-border au-border-input au-bg-background au-shadow-sm hover:au-bg-accent hover:au-text-accent-foreground",
				secondary:
					"au-bg-secondary au-text-secondary-foreground au-shadow-sm hover:au-bg-secondary/80",
				ghost: "hover:au-bg-accent hover:au-text-accent-foreground",
				link: "au-text-primary au-underline-offset-4 hover:au-underline",
			},
			size: {
				default: "au-h-9 au-px-4 au-py-2",
				sm: "au-h-8 au-rounded-md au-px-3 au-text-xs",
				lg: "au-h-10 au-rounded-md au-px-8",
				icon: "au-h-9 au-w-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		// console.log("Button className", className);
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				className={cn(buttonVariants({ variant, size }), className)}
				ref={ref}
				{...props}
			/>
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
