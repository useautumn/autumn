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
	disabled?: boolean;
}

export const GroupedTabButton = ({
	value,
	onValueChange,
	options,
	className,
	disabled,
}: GroupedTabButtonProps) => {
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
						disabled={disabled}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"w-full flex items-center justify-center gap-1 px-[6px] py-1 h-6 text-body border transition-none outline-none whitespace-nowrap !bg-interactive-secondary cursor-pointer",
							"hover:text-primary focus-visible:text-primary",
							"disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
							isActive &&
								" text-primary shadow-[0px_3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							!isActive &&
								"bg-interative-secondary shadow-[0px_-3px_4px_0px_inset_rgba(0,0,0,0.04)]",
							isFirst && "rounded-l-lg border-l",
							!isFirst && "border-l-0",
							isLast && "rounded-r-lg",
						)}
					>
						{option.icon && (
							<span className="size-[14px] flex items-center justify-center">
								{option.icon}
							</span>
						)}
						<span className="text-sm">{option.label}</span>
					</button>
				);
			})}
		</div>
	);
};
