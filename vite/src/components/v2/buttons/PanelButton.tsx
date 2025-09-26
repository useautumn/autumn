import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelButtonProps {
	isSelected: boolean;
	onClick: () => void;
	icon: ReactNode;
	className?: string;
}

export function PanelButton({
	isSelected,
	onClick,
	icon,
	className = "",
}: PanelButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			data-state={isSelected ? "open" : "closed"}
			className={cn(
				// Fixed dimensions
				"w-[144px] h-[72px] relative flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0",
				// Design system classes (following Select pattern)
				"input-base input-shadow select-bg",
				// Thicker border for panel effect
				"!rounded-[0.5rem] !border-[0.09375rem]",
				// Custom panel shadows
				"shadow-[inset_0px_-8px_22px_0px_rgba(0,0,0,0.04)]",
				// Selected state shadows
				// isSelected &&
				// 	"shadow-[0px_8px_18px_20px_rgba(136,56,255,0.05)] shadow-[0px_2px_8px_0px_rgba(136,56,255,0.25)]",
				className,
			)}
		>
			{/* Screws in corners */}
			<div
				className={`absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full ${
					isSelected ? "bg-violet-200" : "bg-neutral-200"
				}`}
			/>
			<div
				className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
					isSelected ? "bg-violet-200" : "bg-neutral-200"
				}`}
			/>
			<div
				className={`absolute bottom-1.5 left-1.5 w-1.5 h-1.5 rounded-full ${
					isSelected ? "bg-violet-200" : "bg-neutral-200"
				}`}
			/>
			<div
				className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
					isSelected ? "bg-violet-200" : "bg-neutral-200"
				}`}
			/>

			{/* Vertical seams - touch inner border edge */}
			<div className="absolute left-1/4 top-0 bottom-0 w-px bg-zinc-300/30" />
			<div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-300/30" />
			<div className="absolute left-3/4 top-0 bottom-0 w-px bg-zinc-300/30" />

			{/* Centered icon */}
			<div
				className={cn(
					"size-9 rounded-xl flex items-center justify-center relative",
					isSelected
						? "bg-[var(--color-panel-icon-background)]"
						: "bg-zinc-100",
				)}
			>
				<div className={isSelected ? "text-primary" : "text-stone-500"}>
					{icon}
				</div>
			</div>
		</button>
	);
}
