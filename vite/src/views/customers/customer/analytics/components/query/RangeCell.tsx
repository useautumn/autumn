import { Calendar, Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { CalendarBlankIcon, CaretLeftIcon } from "@phosphor-icons/react";
import { format, subMonths } from "date-fns";
import { Check } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { CUSTOM_INTERVAL, INTERVAL_LABELS } from "../../utils/intervals";
import { StripCell } from "./StripCell";
import { useTimeRange } from "./useTimeRange";

const formatRange = ({ from, to }: { from: Date; to: Date }) =>
	`${format(from, "MMM d")} – ${format(to, "MMM d")}`;

export const RangeCell = ({ className }: { className?: string }) => {
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
				<StripCell
					label="Range"
					className={className}
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
							className="flex items-center gap-1.5 h-[30px] px-2 text-xs text-tertiary-foreground hover:text-foreground"
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
							<button
								key={preset}
								type="button"
								onClick={() => {
									selectPreset(preset);
									setOpen(false);
								}}
								className={cn(
									"flex items-center justify-between h-[30px] px-2 rounded-[5px] text-left text-[13px] text-muted-foreground hover:bg-muted",
									interval === preset && "bg-muted text-foreground",
								)}
							>
								{INTERVAL_LABELS[preset]}
								{interval === preset && (
									<Check className="h-3 w-3 text-primary" />
								)}
							</button>
						))}
						<span className="h-px my-1 bg-border" />
						<button
							type="button"
							onClick={() => setIsPickingCustom(true)}
							className={cn(
								"flex items-center gap-2 h-[30px] px-2 rounded-[5px] text-left text-[13px] text-muted-foreground hover:bg-muted",
								interval === CUSTOM_INTERVAL && "bg-muted text-foreground",
							)}
						>
							<CalendarBlankIcon
								size={14}
								className="text-tertiary-foreground"
							/>
							Custom range
						</button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
};
