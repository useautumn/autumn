import type * as React from "react";
import { cn } from "@/lib/utils";

interface StackBadgeProps {
	stack: string;
	asset?: string;
	icon?: React.ReactNode;
	isSelected?: boolean;
	onClick?: () => void;
	onSelectedChange?: (selected: boolean) => void;
	className?: string;
}

export default function StackBadge({
	stack,
	asset,
	icon,
	isSelected = false,
	onClick,
	onSelectedChange,
	className,
}: StackBadgeProps) {
	const isClickable = !!(onClick || onSelectedChange);

	const handleClick = () => {
		if (!isClickable) return;
		onSelectedChange?.(!isSelected);
		onClick?.();
	};

	const Component = isClickable ? "button" : "div";

	return (
		<Component
			type={isClickable ? "button" : undefined}
			onClick={handleClick}
			data-state={isSelected ? "selected" : "unselected"}
			className={cn(
				"pr-2 rounded-md shadow-[0px_4px_4px_0px_rgba(0,0,0,0.02)] shadow-[inset_0px_-3px_4px_0px_rgba(0,0,0,0.04)] outline outline-1 outline-offset-[-1px] inline-flex justify-start items-center gap-1.5 transition-none",
				isSelected
					? "bg-interactive-secondary outline-primary"
					: "bg-interactive-secondary outline-border",
				isClickable && !isSelected && "hover:outline-primary cursor-pointer",
				isClickable && "focus-visible:outline-primary focus-visible:outline-2",
				className,
			)}
		>
			<div
				className={cn(
					"size-auto p-1 rounded-tl rounded-bl shadow-[inset_0px_-3px_4px_0px_rgba(0,0,0,0.06)] shadow-[inset_0px_3px_4px_0px_rgba(255,255,255,0.10)] outline outline-1 outline-offset-[-1px] flex justify-center items-center gap-2.5",
					isSelected
						? "bg-interactive-secondary outline-primary"
						: "bg-interactive-secondary outline-border",
				)}
			>
				{asset ? (
					<img className="w-4 h-4" src={asset} alt={stack} />
				) : (
					<div className="w-4 h-4 flex items-center justify-center">{icon}</div>
				)}
			</div>
			<div
				className={cn(
					"justify-start text-xs font-medium font-['Inter']",
					isSelected ? "text-primary" : "text-t2",
				)}
			>
				{stack}
			</div>
		</Component>
	);
}
