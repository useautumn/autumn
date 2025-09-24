/* eslint-disable react-refresh/only-export-components */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./Button";

const iconButtonVariants = cva(
	"", // Empty base - we'll use buttonVariants as base
	{
		variants: {
			iconOrientation: {
				left: "flex-row",
				center: "flex-row justify-center",
				right: "flex-row-reverse",
			},
			responsive: {
				true: "",
				false: "",
			},
		},
		compoundVariants: [
			{
				responsive: true,
				className: "gap-1 sm:gap-1.5 md:gap-2",
			},
		],
		defaultVariants: {
			iconOrientation: "left",
			responsive: false,
		},
	},
);

const iconVariants = cva(
	`shrink-0 overflow-clip relative`,
	{
		variants: {
			size: {
				default: "size-[14px]", // Match Figma design
			},
		},
		defaultVariants: {
			size: "default",
		},
	},
);

export interface IconButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants>,
		VariantProps<typeof iconButtonVariants> {
	asChild?: boolean;
	icon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	children?: React.ReactNode;
	responsive?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
	(
		{
			className,
			variant,
			size,
			iconOrientation = "left",
			responsive = false,
			asChild = false,
			icon,
			rightIcon,
			children,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : "button";

		const renderIcon = (iconNode: React.ReactNode) => {
			if (!iconNode) return null;
			
			return (
				<span className={cn(iconVariants())}>
					{iconNode}
				</span>
			);
		};

		const renderContent = () => {
			switch (iconOrientation) {
				case "left":
					return (
						<>
							{renderIcon(icon)}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(rightIcon)}
						</>
					);
				case "right":
					return (
						<>
							{renderIcon(rightIcon)}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(icon)}
						</>
					);
				case "center":
					return (
						<>
							{renderIcon(icon || rightIcon)}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
						</>
					);
				default:
					return (
						<>
							{renderIcon(icon)}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(rightIcon)}
						</>
					);
			}
		};

		return (
			<Comp
				ref={ref}
				className={cn(
					buttonVariants({ variant, size }),
					iconButtonVariants({ iconOrientation, responsive }),
					responsive && "gap-1 sm:gap-1.5 md:gap-2", // Override button gap for responsive
					className
				)}
				{...props}
			>
				{renderContent()}
			</Comp>
		);
	},
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };