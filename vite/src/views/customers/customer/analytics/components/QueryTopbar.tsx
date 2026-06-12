import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import { endOfDay, format, subMonths } from "date-fns";
import { Check } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";

import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsQueryState } from "../hooks/useAnalyticsQueryState";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectEntityDropdown } from "./SelectEntityDropdown";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";
import { SelectGroupByDropdown } from "./SelectGroupByDropdown";

// Intervals with a single fixed granularity (no day/week/month choice).
const SIMPLE_INTERVALS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"1bc": "Current billing cycle",
};

// Intervals that let the viewer choose the bin size (day/week/month).
const BIN_SIZE_INTERVALS: Record<string, string> = {
	"90d": "Last 90 days",
	"3bc": "Latest 3 billing cycles",
};

const ALL_INTERVALS: Record<string, string> = {
	...SIMPLE_INTERVALS,
	...BIN_SIZE_INTERVALS,
};

// Granularities offered in the bottom section, in display order.
const GRANULARITY_LABELS: Record<string, string> = {
	day: "by day",
	week: "by week",
	month: "by month",
};

const DEFAULT_BIN_SIZE = "day";
const CUSTOM_INTERVAL = "custom";

const supportsBinSizeChoice = (interval: string): boolean =>
	Boolean(BIN_SIZE_INTERVALS[interval]);

// The bin size actually in effect for an interval — fixed for simple/custom
// ranges, viewer-chosen for the multi-granularity ones.
const getEffectiveBinSize = ({
	interval,
	binSize,
}: {
	interval: string;
	binSize?: string | null;
}): string => {
	if (interval === "24h") {
		return "hour";
	}
	if (supportsBinSizeChoice(interval)) {
		return binSize && GRANULARITY_LABELS[binSize] ? binSize : DEFAULT_BIN_SIZE;
	}
	return DEFAULT_BIN_SIZE;
};

const getDisplayLabel = ({
	interval,
	binSize,
	customRange,
}: {
	interval: string;
	binSize: string;
	customRange?: DateRange;
}): string => {
	if (interval === CUSTOM_INTERVAL) {
		if (customRange?.from && customRange?.to) {
			return `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d")}`;
		}
		return "Custom range";
	}
	if (supportsBinSizeChoice(interval) && binSize !== DEFAULT_BIN_SIZE) {
		return `${ALL_INTERVALS[interval]} (${GRANULARITY_LABELS[binSize]})`;
	}
	return ALL_INTERVALS[interval];
};

export const QueryTopbar = () => {
	const { customer, bcExclusionFlag, propertyKeys } = useAnalyticsContext();
	const { queryStates, setQueryStates } = useAnalyticsQueryState();
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		undefined,
	);

	const { interval: selectedInterval, start, end } = queryStates;
	const effectiveBinSize = getEffectiveBinSize({
		interval: selectedInterval,
		binSize: queryStates.bin_size,
	});
	const binSizeChoiceEnabled = supportsBinSizeChoice(selectedInterval);
	const customRange =
		selectedInterval === CUSTOM_INTERVAL && start && end
			? { from: new Date(start), to: new Date(end) }
			: undefined;

	const handleIntervalSelect = (interval: string) => {
		setQueryStates({
			interval,
			bin_size: getEffectiveBinSize({
				interval,
				binSize: queryStates.bin_size,
			}),
			start: null,
			end: null,
		});
	};

	const handleBinSizeSelect = (binSize: string) => {
		setQueryStates({ bin_size: binSize });
	};

	const handleCustomRangeSelect = (range: DateRange | undefined) => {
		setDraftRange(range);
		if (!range?.from || !range?.to) {
			return;
		}
		setQueryStates({
			interval: CUSTOM_INTERVAL,
			bin_size: DEFAULT_BIN_SIZE,
			start: range.from.getTime(),
			end: endOfDay(range.to).getTime(),
		});
	};

	const shouldShowBillingCycleOptions = !bcExclusionFlag && customer;
	const visibleIntervals = Object.keys(ALL_INTERVALS).filter((interval) =>
		shouldShowBillingCycleOptions
			? true
			: interval !== "1bc" && interval !== "3bc",
	);

	return (
		<div className="flex items-center py-0 h-full gap-2">
			<CustomerComboBox />
			{customer?.entities?.length > 0 && <SelectEntityDropdown />}
			<DropdownMenu
				onOpenChange={(open) => {
					if (open) {
						setDraftRange(customRange);
					}
				}}
			>
				<DropdownMenuTrigger asChild>
					<IconButton
						variant="secondary"
						size="default"
						icon={<CaretDownIcon size={12} weight="bold" />}
						iconOrientation="right"
					>
						{getDisplayLabel({
							interval: selectedInterval,
							binSize: effectiveBinSize,
							customRange,
						})}
					</IconButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[220px]">
					{visibleIntervals.map((interval) => (
						<DropdownMenuItem
							key={interval}
							onClick={() => handleIntervalSelect(interval)}
							className="flex items-center justify-between"
						>
							{ALL_INTERVALS[interval]}
							{selectedInterval === interval && (
								<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
							)}
						</DropdownMenuItem>
					))}

					<DropdownMenuSub>
						<DropdownMenuSubTrigger className="flex items-center justify-between">
							<span className="flex items-center gap-1.5">
								<CalendarBlankIcon
									size={14}
									weight="bold"
									className="text-tertiary-foreground"
								/>
								Custom range
							</span>
							{selectedInterval === CUSTOM_INTERVAL && (
								<Check className="mr-1 h-3 w-3 text-tertiary-foreground" />
							)}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="p-0">
							<Calendar
								mode="range"
								numberOfMonths={2}
								selected={draftRange}
								onSelect={handleCustomRangeSelect}
								defaultMonth={
									draftRange?.from ??
									customRange?.from ??
									subMonths(new Date(), 1)
								}
								disabled={{ after: new Date() }}
							/>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuLabel>Granularity</DropdownMenuLabel>
						{Object.entries(GRANULARITY_LABELS).map(([binSize, label]) => (
							<DropdownMenuItem
								key={binSize}
								disabled={!binSizeChoiceEnabled}
								closeOnClick={false}
								onClick={() => handleBinSizeSelect(binSize)}
								className="flex items-center justify-between"
							>
								{label}
								{effectiveBinSize === binSize && (
									<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
								)}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<SelectFeatureDropdown />
			<SelectGroupByDropdown propertyKeys={propertyKeys ?? []} />
		</div>
	);
};
