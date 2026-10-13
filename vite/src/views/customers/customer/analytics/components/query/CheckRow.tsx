import {
	overlayItemClassName,
	overlayItemHighlightClassName,
} from "@autumn/ui/lib/overlay-classes";
import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SeriesSwatch } from "./SeriesSwatch";

export const CheckRow = ({
	checked,
	label,
	title,
	trailing,
	color,
	isMonospace = false,
	isLocked = false,
	onToggle,
}: {
	checked: boolean;
	label: string;
	/** Hover text; defaults to the label. */
	title?: string;
	trailing?: string;
	/** The row's chart colour, shown as a swatch beside the label. */
	color?: string;
	isMonospace?: boolean;
	/** Keeps the row from being unticked, e.g. the last visible group. */
	isLocked?: boolean;
	onToggle: () => void;
}) => (
	<button
		type="button"
		onClick={onToggle}
		disabled={isLocked}
		title={title ?? label}
		className={cn(
			overlayItemClassName,
			overlayItemHighlightClassName,
			"w-full shrink-0 text-left hover:bg-overlay-hover hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent",
		)}
	>
		<span
			className={cn(
				"flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border border-input",
				checked && "border-primary bg-primary",
			)}
		>
			{checked && (
				<CheckIcon weight="bold" className="size-2.5 text-primary-foreground" />
			)}
		</span>
		{color && <SeriesSwatch color={color} />}
		<span
			className={cn(
				"min-w-0 flex-1 truncate",
				checked && "text-foreground",
				isMonospace && "font-mono text-xs",
			)}
		>
			{label}
		</span>
		{trailing && (
			<span className="shrink-0 text-xs text-tertiary-foreground tabular-nums">
				{trailing}
			</span>
		)}
	</button>
);
