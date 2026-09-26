import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const CheckRow = ({
	checked,
	label,
	title,
	sublabel,
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
	sublabel?: string | null;
	trailing?: string;
	/** The row's chart colour, used to fill its checkbox when ticked. */
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
		className="flex items-center gap-2.5 w-full min-h-[30px] px-1.5 py-1 rounded-md text-left hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
	>
		<span
			className={cn(
				"flex items-center justify-center size-3.5 shrink-0 rounded-[4px] border border-input text-primary-foreground",
				checked && "bg-primary border-primary",
			)}
			style={
				checked && color ? { background: color, borderColor: color } : undefined
			}
		>
			{checked && <CheckIcon size={10} weight="bold" />}
		</span>
		<span className="flex flex-col min-w-0 flex-1">
			<span
				className={cn(
					"truncate text-[13px] leading-4",
					checked ? "text-foreground" : "text-tertiary-foreground",
					isMonospace && "font-mono text-xs",
				)}
			>
				{label}
			</span>
			{sublabel && (
				<span className="truncate text-[11px] leading-4 text-subtle">
					{sublabel}
				</span>
			)}
		</span>
		{trailing && (
			<span className="shrink-0 text-xs text-subtle tabular-nums">
				{trailing}
			</span>
		)}
	</button>
);
