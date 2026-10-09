import { Calendar, Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { overlaySeparatorClassName } from "@autumn/ui/lib/overlay-classes";
import {
	CalendarBlankIcon,
	CaretLeftIcon,
	CaretRightIcon,
} from "@phosphor-icons/react";
import { format, subMonths } from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { CUSTOM_INTERVAL, INTERVAL_LABELS } from "../../utils/intervals";
import { FilterTriggerButton } from "../FilterTriggerButton";
import { OptionRow } from "./OptionRow";
import { useTimeRange } from "./useTimeRange";

const formatRange = ({ from, to }: { from: Date; to: Date }) =>
	`${format(from, "MMM d")} – ${format(to, "MMM d")}`;

export const RangeCell = () => {
	const {
		interval,
		customRange,
		presetIntervals,
		selectPreset,
		selectCustomRange,
	} = useTimeRange();
	const [open, setOpen] = useState(false);
	const [isPickingCustom, setIsPickingCustom] = useState(false);
	const [draftRange, setDraftRange] = useState<DateRange | undefined>();

	const openChange = (nextOpen: boolean) => {
		setOpen(nextOpen);
		if (!nextOpen) return;
		setDraftRange(customRange);
		setIsPickingCustom(interval === CUSTOM_INTERVAL);
	};

	return (
		<Popover open={open} onOpenChange={openChange}>
			<PopoverTrigger asChild>
				<FilterTriggerButton
					leading={
						<CalendarBlankIcon className="size-3.5 text-tertiary-foreground" />
					}
					value={
						customRange ? formatRange(customRange) : INTERVAL_LABELS[interval]
					}
				/>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className={cn("p-1", isPickingCustom ? "w-auto" : "w-[220px]")}
			>
				{isPickingCustom ? (
					<div className="flex flex-col">
						<button
							type="button"
							onClick={() => setIsPickingCustom(false)}
							className="flex h-[30px] items-center gap-1.5 px-2 text-xs text-tertiary-foreground hover:text-foreground"
						>
							<CaretLeftIcon size={12} />
							Presets
						</button>
						<Calendar
							mode="range"
							numberOfMonths={2}
							selected={draftRange}
							onSelect={(range) => {
								setDraftRange(range);
								selectCustomRange(range);
								if (range?.from && range?.to) setOpen(false);
							}}
							defaultMonth={
								draftRange?.from ??
								customRange?.from ??
								subMonths(new Date(), 1)
							}
							disabled={{ after: new Date() }}
						/>
					</div>
				) : (
					<div className="flex flex-col">
						{presetIntervals.map((preset) => (
							<OptionRow
								key={preset}
								isSelected={interval === preset}
								onSelect={() => {
									selectPreset(preset);
									setOpen(false);
								}}
							>
								{INTERVAL_LABELS[preset]}
							</OptionRow>
						))}
						<span className={overlaySeparatorClassName} />
						<OptionRow
							isSelected={interval === CUSTOM_INTERVAL}
							onSelect={() => setIsPickingCustom(true)}
							trailing={<CaretRightIcon />}
						>
							<CalendarBlankIcon />
							Custom range
						</OptionRow>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
};
