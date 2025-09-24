/* eslint-disable react-refresh/only-export-components */
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
	`inline-flex items-center gap-1 whitespace-nowrap font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive shrink-0`,
	{
		variants: {
			variant: {
				secondary: `bg-white border border-[#d1d1d1] border-solid hover:border-primary hover:bg-hover-primary focus:bg-active-primary focus:border-primary shadow-[0px_4px_4px_0px_rgba(0,0,0,0.02)] [&]:shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]`,
				ghost: `hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50`,
				primary: `bg-primary border border-transparent hover:bg-primary-btn-hover focus:bg-primary-btn-active text-white`,
			},
			size: {
				sm: "px-1.5 py-1 rounded text-xs sm:px-2 sm:py-1.5 md:px-2.5 md:py-2",
				default: "px-[6px] py-[4px] rounded-[6px] text-[13px] sm:px-2 sm:py-1.5 sm:text-sm md:px-3 md:py-2",
				lg: "px-2 py-1.5 rounded-lg text-sm sm:px-3 sm:py-2 md:px-4 md:py-2.5 md:text-base",
			},
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
				variant: "secondary",
				className: "text-[#444444] font-['Inter:Medium',_sans-serif] font-medium leading-[0] tracking-[-0.039px]",
			},
			{
				responsive: true,
				size: "sm",
				className: "gap-0.5 sm:gap-1 md:gap-1.5",
			},
			{
				responsive: true,
				size: "default",
				className: "gap-1 sm:gap-1.5 md:gap-2",
			},
			{
				responsive: true,
				size: "lg",
				className: "gap-1.5 sm:gap-2 md:gap-2.5",
			},
		],
		defaultVariants: {
			variant: "secondary",
			size: "default",
			iconOrientation: "left",
			responsive: false,
		},
	},
);

const iconVariants = cva(
	`shrink-0`,
	{
		variants: {
			size: {
				sm: "size-3 sm:size-3.5 md:size-4",
				default: "size-[14px] sm:size-4 md:size-5",
				lg: "size-4 sm:size-5 md:size-6",
			},
			responsive: {
				true: "",
				false: "",
			},
		},
		compoundVariants: [
			{
				responsive: false,
				size: "sm",
				className: "size-3",
			},
			{
				responsive: false,
				size: "default",
				className: "size-[14px]",
			},
			{
				responsive: false,
				size: "lg",
				className: "size-4",
			},
		],
		defaultVariants: {
			size: "default",
			responsive: false,
		},
	},
);

export interface IconButtonProps
	extends React.ComponentProps<"button">,
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

		const renderIcon = (iconNode: React.ReactNode, position: "left" | "right") => {
			if (!iconNode) return null;
			
			return (
				<span className={cn(iconVariants({ size, responsive }), "overflow-clip relative")}>
					{iconNode}
				</span>
			);
		};

		const renderContent = () => {
			switch (iconOrientation) {
				case "left":
					return (
						<>
							{renderIcon(icon, "left")}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(rightIcon, "right")}
						</>
					);
				case "right":
					return (
						<>
							{renderIcon(rightIcon, "right")}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(icon, "left")}
						</>
					);
				case "center":
					return (
						<>
							{renderIcon(icon || rightIcon, "left")}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
						</>
					);
				default:
					return (
						<>
							{renderIcon(icon, "left")}
							{children && (
								<span className="text-nowrap">{children}</span>
							)}
							{renderIcon(rightIcon, "right")}
						</>
					);
			}
		};

		return (
			<Comp
				ref={ref}
				className={cn(iconButtonVariants({ variant, size, iconOrientation, responsive, className }))}
				{...props}
			>
				{renderContent()}
			</Comp>
		);
	},
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };