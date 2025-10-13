"use client";

import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "../buttons/Button";
import { iconButtonVariants } from "../buttons/IconButton";

export interface IconCheckboxProps
	extends ButtonProps,
		VariantProps<typeof iconButtonVariants> {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	icon?: React.ReactNode;
	iconOrientation?: "left" | "center" | "right";
}

const IconCheckbox = React.forwardRef<HTMLButtonElement, IconCheckboxProps>(
	(
		{
			className,
			variant = "secondary",
			size = "sm",
			hide = false,
			iconOrientation = "center",
			asChild = false,
			checked = false,
			onCheckedChange,
			icon,
			onClick,
			children,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : Button;

		const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
			onCheckedChange?.(!checked);
			onClick?.(event);
			// Remove focus after click to prevent stuck active state
			event.currentTarget.blur();
		};

		const getIconColor = () => {
			if (checked) {
				switch (variant) {
					case "secondary":
					case "muted":
					case "skeleton":
						return "text-t2";
					case "primary":
						return "text-[#f3f3f3]";
					case "destructive":
						return "text-[#FEE1E1]";
					default:
						return "text-t2";
				}
			} else {
				switch (variant) {
					case "secondary":
					case "muted":
					case "skeleton":
						return "text-t3";
					case "primary":
						return "text-[#f3f3f3]";
					case "destructive":
						return "text-[#FEE1E1]";
					default:
						return "text-t3";
				}
			}
		};

		const renderIcon = (icon: React.ReactNode) => {
			if (!icon) return null;

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
						</>
					);
				case "right":
					return (
						<>
							{children}
							{renderIcon(icon)}
						</>
					);
				case "center":
					return (
						<>
							{renderIcon(icon)}
							{children}
						</>
					);
				default:
					return (
						<>
							{renderIcon(icon)}
							{children}
						</>
					);
			}
		};

		const iconToMainClass = () => {
			switch (iconOrientation) {
				case "center":
					if (size === "sm") {
						return "!h-6 w-6";
					} else {
						return "!h-7 w-7";
					}
				default:
					return "";
			}
		};

		if (hide) return null;

		return (
			<Comp
				ref={ref}
				variant={variant}
				size={size}
				asChild={false} // We handle Slot ourselves
				className={cn(
					iconButtonVariants({ iconOrientation }),
					iconToMainClass(),
					"input-base input-shadow-tiny input-state-open-tiny",
					className,
				)}
				onClick={handleClick}
				data-state={checked ? "open" : "closed"}
				aria-pressed={checked}
				{...props}
			>
				{renderContent()}
			</Comp>
		);
	},
);

IconCheckbox.displayName = "IconCheckbox";

export { IconCheckbox };
