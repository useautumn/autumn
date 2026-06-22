/* eslint-disable react-refresh/only-export-components */

import { Badge, cn } from "@autumn/ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const iconBadgeVariants = cva(
	"flex-row justify-center gap-[3px] min-w-10", // Gap is handled in position variants
	{
		variants: {
			position: {
				left: "flex-row",
				right: "flex-row-reverse",
			},
		},
		defaultVariants: {
			position: "left",
		},
	},
);

interface IconBadgeProps
	extends Omit<
			React.ComponentProps<"span">,
			keyof VariantProps<typeof iconBadgeVariants>
		>,
		VariantProps<typeof iconBadgeVariants> {
	icon?: React.ReactNode;
	rightIcon?: React.ReactNode;
	variant?: "default" | "muted";
	asChild?: boolean;
}

const IconBadge = React.forwardRef<HTMLSpanElement, IconBadgeProps>(
	(
		{
			className,
			variant = "muted",
			position = "left",
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
				case "muted":
					return "text-subtle";
				case "default":
					return "text-zinc-50";
				default:
					return "text-subtle"; // Default fallback
			}
		};

		const renderIcon = (icon: React.ReactNode) => {
			if (!icon) return null;

			if (React.isValidElement<{ className?: string }>(icon)) {
				return React.cloneElement(icon, {
					className: cn("size-3", getIconColor(), icon.props.className),
				} as React.HTMLAttributes<HTMLElement>);
			}

			return icon;
		};

		const renderContent = () => {
			switch (position) {
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
							{renderIcon(rightIcon)}
							{children}
							{renderIcon(icon)}
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

		return (
			<Badge
				ref={ref}
				variant={variant}
				asChild={asChild}
				className={cn("h-6", iconBadgeVariants({ position }), className)}
				{...props}
			>
				{renderContent()}
			</Badge>
		);
	},
);

IconBadge.displayName = "IconBadge";

export { IconBadge };
