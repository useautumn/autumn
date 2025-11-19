/* eslint-disable react-refresh/only-export-components */

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./Button";

const iconButtonVariants = cva(
	"", // Empty base - we'll use buttonVariants as base
	{
		variants: {
			iconOrientation: {
				left: "flex-row",
				center: "flex-row justify-center",
				right: "flex-row-reverse",
			},
		},
		compoundVariants: [
			{
				className: "gap-1",
			},
		],
		defaultVariants: {
			iconOrientation: "left",
		},
	},
);

export interface IconButtonProps
	extends ButtonProps,
		VariantProps<typeof iconButtonVariants> {
	icon?: React.ReactNode;
	rightIcon?: React.ReactNode;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
	(
		{
			className,
			variant,
			size,
			iconOrientation = "left",
			asChild = false,
			icon,
			rightIcon,
			children,
			...props
		},
		ref,
	) => {
		const getIconColor = () => {
			switch (variant) {
				case "secondary":
				case "muted":
					return "group-hover:text-inherit";
				case "skeleton":
					return "";
				case "primary":
					return "text-table-hover";
				case "destructive":
					return "text-error-light";
				default:
					return "text-t3"; // Default fallback
			}
		};

		const renderIcon = (icon: React.ReactNode) => {
			if (!icon) return null;

			// Clone the icon and add default size and color classes
			if (React.isValidElement(icon)) {
				return React.cloneElement(icon, {
					className: cn(
						size === "sm" ? "size-3" : "size-3.5",
						getIconColor(),
						icon.props.className,
					),
				} as React.HTMLAttributes<HTMLElement>);
			}

			return icon;
		};

		const renderContent = () => {
			switch (iconOrientation) {
				case "left":
					return (
						<>
							{renderIcon(icon)}
							{children}
							{renderIcon(rightIcon)}
						</>
					);
				case "right":
					return (
						<>
							{renderIcon(icon)}
							{children}
							{renderIcon(rightIcon)}
						</>
					);
				case "center":
					return (
						<>
							{renderIcon(icon || rightIcon)}
							{children}
						</>
					);
				default:
					return (
						<>
							{renderIcon(icon)}
							{children}
							{renderIcon(rightIcon)}
						</>
					);
			}
		};

		const iconToMainClass = () => {
			switch (iconOrientation) {
				case "center":
					return "!h-6 w-6"; // by default is size small
				default:
					return "";
			}
		};

		return (
			<Button
				ref={ref}
				variant={variant}
				size={size}
				asChild={asChild}
				className={cn(
					iconButtonVariants({ iconOrientation }),
					iconToMainClass(),
					className,
				)}
				{...props}
			>
				{renderContent()}
			</Button>
		);
	},
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
