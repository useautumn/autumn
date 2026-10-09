import {
	overlayItemClassName,
	overlayItemHighlightClassName,
} from "@autumn/ui/lib/overlay-classes";
import { CheckIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Single-select row for hand-built popovers: label, optional hint, check when picked. */
export const OptionRow = ({
	children,
	isSelected = false,
	hint,
	trailing,
	disabled = false,
	onSelect,
}: {
	children: ReactNode;
	isSelected?: boolean;
	hint?: string;
	trailing?: ReactNode;
	disabled?: boolean;
	onSelect: () => void;
}) => (
	<button
		type="button"
		disabled={disabled}
		onClick={onSelect}
		className={cn(
			overlayItemClassName,
			overlayItemHighlightClassName,
			"w-full shrink-0 text-left hover:bg-overlay-hover hover:text-foreground disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
			isSelected && "text-foreground",
		)}
	>
		<span className="flex min-w-0 flex-1 items-center gap-2 truncate">
			{children}
		</span>
		{hint && (
			<span className="shrink-0 text-xs text-tertiary-foreground">{hint}</span>
		)}
		{isSelected && <CheckIcon className="text-foreground" />}
		{trailing}
	</button>
);
