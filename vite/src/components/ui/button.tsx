import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle, PlusIcon, Search } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

// [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0

const buttonVariants = cva(
	`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-zinc-300 font-regular
  
  `,
	{
		variants: {
			variant: {
				// border border-[#8231FF]
				default:
					// "bg-zinc-900 text-zinc-50 shadow hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90",
					`bg-primary hover:bg-primary/90 text-zinc-50 shadow dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90
          !rounded-xs
          `,
				secondary:
					"border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
				// "bg-zinc-100 text-zinc-900 shadow-sm hover:bg-zinc-100/80 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/80",
				destructive:
					"font-semibold text-red-400 border border-red-400 rounded-md shadow-sm hover:bg-red-500/90 hover:text-zinc-50 dark:bg-red-900 dark:text-zinc-50 dark:hover:bg-red-900/90 shadow-sm ",
				// destructive:
				//   "bg-red-500 font-semibold text-zinc-50 shadow-sm hover:bg-red-500/90 dark:bg-red-900 dark:text-zinc-50 dark:hover:bg-red-900/90",
				outline:
					"border border-zinc-200 bg-white shadow-sm hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
				ghost:
					"hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
				sidebarItem:
					"hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 !px-2 !h-fit !py-0.5 truncate justify-start",
				link: "text-zinc-900 underline-offset-4 hover:underline dark:text-zinc-50",
				dashed:
					"hover:bg-stone-100 text-t2 border border-1 border-dashed border-stone-300",
				// shadow-sm hover:from-stone-100 hover:to-stone-200 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50
				gradientPrimary:
					"bg-gradient-to-b font-semibold border-t border-purple-400 outline outline-primary  rounded-sm from-primary/85 to-primary text-white hover:from-primary hover:to-primary  shadow-purple-500/50 transition-[background] duration-300 !h-7.5 mt-0.25",

				gradientSecondary:
					"border border-stone-300 font-semibold bg-gradient-to-b from-white to-stone-100 text-t1 hover:from-stone-300 hover:to-stone-400 shadow-sm",
				// add: "text-primary border-t border-white outline outline-purple-800/20 bg-gradient-to-b from-zinc-50 to-zinc-200/70 shadow-sm hover:from-zinc-200 hover:border-zinc-200 hover:text-primary dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 !h-6 rounded-md",
				add: "text-primary border-t border-white outline outline-zinc-200 bg-gradient-to-b from-stone-100 to-zinc-50 hover:from-stone-100 hover:to-stone-100 hover:border-primary  dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 !h-9.5 rounded-none",
				// add: "border-t border-purple-400 bg-gradient-to-b from-primary/90 to-primary text-white hover:from-primary hover:to-primary !shadow-lg !h-6 rounded-md",

				analyse:
					"text-primary border-t border-white outline outline-zinc-200 bg-gradient-to-b from-stone-100 to-zinc-50 hover:from-stone-100 hover:to-stone-100 hover:border-primary  dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 !h-9.5 rounded-none",

				destructivePrimary:
					"bg-gradient-to-b font-semibold border-t border-red-400 outline outline-red-500 rounded-sm from-red-500/85 to-red-500 text-white hover:from-red-500 hover:to-red-500 shadow-red-500/50 transition-[background] duration-300 !h-7.5 mt-0.25",

				auth: "!gap-2 hover:bg-stone-100 border border-zinc-250 bg-white text-t1 w-full shadow-sm",
				dialogBack:
					"hover:!bg-zinc-200 p-1 !h-7 ml-2 !px-1.5 text-t3 rounded-md",
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
	},
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
	tooltipContent?: string;
	disableStartIcon?: boolean;
	shimmer?: boolean;
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
			tooltipContent,
			children,
			disableStartIcon = false,
			shimmer = false,
			...props
		},
		ref,
	) => {
		const Comp = asChild ? Slot : "button";
		const Button = (
			<Comp
				{...props}
				className={cn(
					buttonVariants({ variant, size, className }),
					isIcon && `w-${dim} h-${dim} p-0`,
					shimmer && "shimmer",
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
				disabled={isLoading || props.disabled || shimmer}
			>
				{isLoading && <LoaderCircle className="animate-spin" size={14} />}
				{startIcon && !isLoading && <>{startIcon}</>}
				{!isLoading && !startIcon && variant == "add" && !disableStartIcon && (
					<PlusIcon size={12} />
				)}
				{!isLoading &&
					!startIcon &&
					variant == "analyse" &&
					!disableStartIcon && <Search size={12} />}
				{children}
				{endIcon && !isLoading && <>{endIcon}</>}
			</Comp>
		);

		if (tooltipContent) {
			return (
				<Tooltip delayDuration={200}>
					<TooltipTrigger asChild>{Button}</TooltipTrigger>
					<TooltipContent>{tooltipContent}</TooltipContent>
				</Tooltip>
				// <Tooltip content={tooltipContent}>
				//   {Button}
				// </Tooltip>
			);
		} else {
			return Button;
		}
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
