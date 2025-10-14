import type * as React from "react";
import { cn } from "@/lib/utils";

interface GroupedTabButtonProps {
	value: string;
	onValueChange: (value: string) => void;
	options: Array<{
		value: string;
		label: string;
		icon?: React.ReactNode;
	}>;
	className?: string;
}

export const GroupedTabButton = ({
	value,
	onValueChange,
	options,
	className,
}: GroupedTabButtonProps) => {
	const isTwoTab = options.length === 2;

	return (
		<div className={cn("flex items-center", className)}>
			{options.map((option, index) => {
				const isActive = value === option.value;
				const isFirst = index === 0;
				const isLast = index === options.length - 1;

				return (
					<button
						key={option.value}
						type="button"
						onClick={() => onValueChange(option.value)}
						className={cn(
							"flex items-center gap-1 px-[6px] py-1 h-6 text-body border border-t10 transition-none outline-none whitespace-nowrap",
							"hover:text-primary focus-visible:text-primary",
							isActive &&
								"bg-[#f9f5ff] text-primary shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							!isActive &&
								"bg-white shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							isFirst && "rounded-l-md border-l",
							!isFirst && "border-l-0",
							isLast && "rounded-r-md",
						)}
					>
						{isTwoTab && isFirst && option.icon && (
							<span className="size-[14px] flex items-center justify-center">
								{option.icon}
							</span>
						)}
						<span className="text-body">{option.label}</span>
						{isTwoTab && isLast && option.icon && (
							<span className="size-[14px] flex items-center justify-center">
								{option.icon}
							</span>
						)}
						{!isTwoTab && option.icon && (
							<span className="size-[14px] flex items-center justify-center">
								{option.icon}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
};
