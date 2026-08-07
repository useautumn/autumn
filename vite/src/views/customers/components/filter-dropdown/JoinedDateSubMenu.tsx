import {
	Calendar,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@autumn/ui";
import { endOfDay, format, isSameDay, startOfDay, subMonths } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { useCustomerFilters } from "../../hooks/useCustomerFilters";

type JoinedBounds = { from: number | null; to: number | null };

const ACTION_BUTTON_CLASS =
	"flex-1 rounded-md px-2 py-1 text-xs text-tertiary-foreground hover:bg-accent hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40";

const toDateRange = ({ from, to }: JoinedBounds): DateRange | undefined => {
	if (from === null && to === null) return undefined;
	return {
		from: from === null ? undefined : new Date(from),
		to: to === null ? undefined : new Date(to),
	};
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
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		undefined,
	);

	const bounds: JoinedBounds = {
		from: queryStates.joinedFrom,
		to: queryStates.joinedTo,
	};
	const selectedRange = toDateRange(bounds);
	const label = getJoinedLabel(bounds);

	const applyBounds = ({ from, to }: JoinedBounds) => {
		setFilters({ joinedFrom: from, joinedTo: to });
		onChange?.();
	};

	const handleSelect = (range: DateRange | undefined) => {
		setDraftRange(range);
		if (!range?.from) {
			applyBounds({ from: null, to: null });
			return;
		}
		applyBounds({
			from: startOfDay(range.from).getTime(),
			to: endOfDay(range.to ?? range.from).getTime(),
		});
	};

	const keepEndBoundOnly = () => {
		setDraftRange({ from: undefined, to: draftRange?.to });
		applyBounds({ from: null, to: bounds.to });
	};

	const keepStartBoundOnly = () => {
		setDraftRange({ from: draftRange?.from, to: undefined });
		applyBounds({ from: bounds.from, to: null });
	};

	const clearJoinedRange = () => {
		setDraftRange(undefined);
		applyBounds({ from: null, to: null });
	};

	return (
		<DropdownMenuSub
			onOpenChange={(open) => {
				if (open) setDraftRange(selectedRange);
			}}
		>
			<DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
				Joined
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
					selected={draftRange ?? selectedRange}
					onSelect={handleSelect}
					defaultMonth={
						draftRange?.from ?? draftRange?.to ?? subMonths(new Date(), 1)
					}
					disabled={{ after: new Date() }}
				/>
				<div className="flex items-center gap-1 border-t border-border p-1">
					<button
						type="button"
						className={ACTION_BUTTON_CLASS}
						disabled={bounds.to === null}
						onClick={keepEndBoundOnly}
					>
						Before
					</button>
					<button
						type="button"
						className={ACTION_BUTTON_CLASS}
						disabled={bounds.from === null}
						onClick={keepStartBoundOnly}
					>
						After
					</button>
					<button
						type="button"
						className={ACTION_BUTTON_CLASS}
						disabled={label === null}
						onClick={clearJoinedRange}
					>
						Clear
					</button>
				</div>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
};
