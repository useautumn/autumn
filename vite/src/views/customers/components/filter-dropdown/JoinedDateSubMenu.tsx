import {
	Calendar,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { endOfDay, format, isSameDay, startOfDay, subMonths } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

type JoinedBounds = { from: number | null; to: number | null };
type JoinedMode = "range" | "before" | "after";
type JoinedAnchor = { from: Date; to: Date };
type JoinedSelection = { mode: JoinedMode; anchor: JoinedAnchor | null };

const ACTION_BUTTON_CLASS =
	"flex-1 rounded-md px-2 py-1 text-xs text-tertiary-foreground hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40";
const ACTION_BUTTON_ACTIVE_CLASS = "bg-accent text-foreground";

const toJoinedBounds = ({ mode, anchor }: JoinedSelection): JoinedBounds => {
	if (anchor === null) return { from: null, to: null };
	if (mode === "before")
		return { from: null, to: endOfDay(anchor.to).getTime() };
	if (mode === "after")
		return { from: startOfDay(anchor.from).getTime(), to: null };
	return {
		from: startOfDay(anchor.from).getTime(),
		to: endOfDay(anchor.to).getTime(),
	};
};

const toJoinedSelection = ({ from, to }: JoinedBounds): JoinedSelection => {
	if (from !== null && to !== null)
		return {
			mode: "range",
			anchor: { from: new Date(from), to: new Date(to) },
		};
	if (to !== null) {
		const boundary = new Date(to);
		return { mode: "before", anchor: { from: boundary, to: boundary } };
	}
	if (from !== null) {
		const boundary = new Date(from);
		return { mode: "after", anchor: { from: boundary, to: boundary } };
	}
	return { mode: "range", anchor: null };
};

/** react-day-picker reports the resulting range, not the day, so infer it from whichever endpoint moved. */
const getClickedDay = ({
	from,
	to,
	anchor,
}: {
	from: Date;
	to: Date | undefined;
	anchor: JoinedAnchor | null;
}): Date => {
	if (anchor === null || to === undefined) return from;
	return isSameDay(from, anchor.from) ? to : from;
};

const getJoinedLabel = ({ from, to }: JoinedBounds): string | null => {
	if (from !== null && to !== null) {
		return isSameDay(from, to)
			? format(from, "MMM d, yyyy")
			: `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`;
	}
	if (to !== null) return `Before ${format(to, "MMM d, yyyy")}`;
	if (from !== null) return `After ${format(from, "MMM d, yyyy")}`;
	return null;
};

export const JoinedDateSubMenu = ({ onChange }: { onChange?: () => void }) => {
	const { queryStates, setFilters } = useCustomerFilters();

	const bounds: JoinedBounds = {
		from: queryStates.joinedFrom,
		to: queryStates.joinedTo,
	};

	const [selection, setSelection] = useState<JoinedSelection>(() =>
		toJoinedSelection(bounds),
	);
	const { mode, anchor } = selection;
	const label = getJoinedLabel(bounds);

	const commitSelection = (next: JoinedSelection) => {
		const nextBounds = toJoinedBounds(next);
		setSelection(next);
		setFilters({ joinedFrom: nextBounds.from, joinedTo: nextBounds.to });
		onChange?.();
	};

	const handleSelect = (range: DateRange | undefined) => {
		if (!range?.from) {
			commitSelection({ mode: "range", anchor: null });
			return;
		}
		if (mode === "range") {
			commitSelection({
				mode,
				anchor: { from: range.from, to: range.to ?? range.from },
			});
			return;
		}
		const boundary = getClickedDay({ from: range.from, to: range.to, anchor });
		commitSelection({ mode, anchor: { from: boundary, to: boundary } });
	};

	const toggleMode = (nextMode: JoinedMode) => {
		if (anchor === null) return;
		commitSelection({ mode: mode === nextMode ? "range" : nextMode, anchor });
	};

	const clearJoinedRange = () =>
		commitSelection({ mode: "range", anchor: null });

	const hasAnchor = anchor !== null;
	// Before/After are single-date modes; a multi-day range has no unambiguous boundary.
	const hasSingleDayAnchor =
		anchor !== null && isSameDay(anchor.from, anchor.to);

	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open) setSelection(toJoinedSelection(bounds));
			}}
		>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Created At
				{label && (
					<span className="truncate text-xs text-tertiary-foreground bg-muted px-1 py-0 rounded-md">
						{label}
					</span>
				)}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="p-0">
				<Calendar
					mode="range"
					numberOfMonths={2}
					selected={anchor ?? undefined}
					onSelect={handleSelect}
					defaultMonth={anchor?.from ?? subMonths(new Date(), 1)}
					disabled={{ after: new Date() }}
				/>
				<div className="flex items-center gap-1 border-t border-border p-1">
					<button
						type="button"
						className={cn(
							ACTION_BUTTON_CLASS,
							mode === "before" && ACTION_BUTTON_ACTIVE_CLASS,
						)}
						aria-pressed={mode === "before"}
						disabled={!hasSingleDayAnchor}
						onClick={() => toggleMode("before")}
					>
						Before
					</button>
					<button
						type="button"
						className={cn(
							ACTION_BUTTON_CLASS,
							mode === "after" && ACTION_BUTTON_ACTIVE_CLASS,
						)}
						aria-pressed={mode === "after"}
						disabled={!hasSingleDayAnchor}
						onClick={() => toggleMode("after")}
					>
						After
					</button>
					<button
						type="button"
						className={ACTION_BUTTON_CLASS}
						disabled={!hasAnchor}
						onClick={clearJoinedRange}
					>
						Clear
					</button>
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
