import { cn } from "@autumn/ui/lib/utils";
import type * as React from "react";

interface GroupedTabButtonProps {
	value: string;
	onValueChange: (value: string) => void;
	options: Array<{
		value: string;
		label?: React.ReactNode;
		icon?: React.ReactNode;
		ariaLabel?: string;
	}>;
	className?: string;
	buttonClassName?: string;
	disabled?: boolean;
}

export const GroupedTabButton = ({
	value,
	onValueChange,
	options,
	className,
	buttonClassName,
	disabled,
}: GroupedTabButtonProps) => {
	return (
		<div
			className={cn(
				"flex items-center gap-0.5 rounded-lg border border-table-tray-border bg-table-tray p-0.5",
				className,
			)}
		>
			{options.map((option) => {
				const isActive = value === option.value;

				return (
					<button
						key={option.value}
						type="button"
						aria-label={option.ariaLabel}
						aria-pressed={isActive}
						disabled={disabled}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"flex h-6 w-full cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-2 text-tertiary-foreground outline-none transition-colors duration-150",
							"hover:text-foreground focus-visible:text-foreground",
							"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
							isActive &&
								"border-table-surface-border bg-table-surface text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.3)]",
							buttonClassName,
						)}
					>
						{option.icon && (
							<span className="flex size-[14px] items-center justify-center">
								{option.icon}
							</span>
						)}
						{option.label != null && (
							<span className="text-sm font-medium">{option.label}</span>
						)}
					</button>
				);
			})}
		</div>
	);
};
