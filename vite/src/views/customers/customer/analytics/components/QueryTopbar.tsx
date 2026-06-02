import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import { endOfDay, format, subMonths } from "date-fns";
import { Check } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { IconButton } from "@/components/v2/buttons/IconButton";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { Calendar } from "@/components/ui/calendar";

import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsQueryState } from "../hooks/useAnalyticsQueryState";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectEntityDropdown } from "./SelectEntityDropdown";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";
import { SelectGroupByDropdown } from "./SelectGroupByDropdown";

// Simple intervals without bin size options
const SIMPLE_INTERVALS: Record<string, string> = {
	"24h": "Last 24 hours",
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"1bc": "Current billing cycle",
};

// Intervals that support bin size selection (day/month)
const BIN_SIZE_INTERVALS: Record<string, string> = {
	"90d": "Last 90 days",
	"3bc": "Latest 3 billing cycles",
};

const ALL_INTERVALS: Record<string, string> = {
	...SIMPLE_INTERVALS,
	...BIN_SIZE_INTERVALS,
};

const BIN_SIZE_LABELS: Record<string, string> = {
	day: "by day",
	month: "by month",
};

const CUSTOM_INTERVAL = "custom";

const getDisplayLabel = ({
	interval,
	binSize,
	customRange,
}: {
	interval: string;
	binSize: string;
	customRange?: DateRange;
}) => {
	if (interval === CUSTOM_INTERVAL) {
		if (customRange?.from && customRange?.to) {
			return `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d")}`;
		}
		return "Custom range";
	}
	if (BIN_SIZE_INTERVALS[interval] && binSize === "month") {
		return `${ALL_INTERVALS[interval]} (by month)`;
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
	const selectedBinSize = queryStates.bin_size ?? "day";
	const customRange =
		selectedInterval === CUSTOM_INTERVAL && start && end
			? { from: new Date(start), to: new Date(end) }
			: undefined;

	const handleSimpleIntervalSelect = (interval: string) => {
		setQueryStates({ interval, bin_size: "day", start: null, end: null });
	};

	const handleBinSizeIntervalSelect = ({
		interval,
		binSize,
	}: {
		interval: string;
		binSize: string;
	}) => {
		setQueryStates({ interval, bin_size: binSize, start: null, end: null });
	};

	const handleCustomRangeSelect = (range: DateRange | undefined) => {
		setDraftRange(range);
		if (!range?.from || !range?.to) {
			return;
		}
		setQueryStates({
			interval: CUSTOM_INTERVAL,
			bin_size: "day",
			start: range.from.getTime(),
			end: endOfDay(range.to).getTime(),
		});
	};

	const shouldShowBillingCycleOptions = !bcExclusionFlag && customer;

	return (
		<div className="flex items-center py-0 h-full gap-2">
			<CustomerComboBox />
			{customer?.entities?.length > 0 && <SelectEntityDropdown />}
			<DropdownMenu
				onOpenChange={(open) => {
					if (open) {
						setDraftRange(undefined);
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
							binSize: selectedBinSize,
							customRange,
						})}
					</IconButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-[200px]">
					{/* Simple intervals without submenus */}
					{Object.keys(SIMPLE_INTERVALS)
						.filter((interval) => {
							if (!shouldShowBillingCycleOptions) {
								return interval !== "1bc";
							}
							return true;
						})
						.map((interval) => (
							<DropdownMenuItem
								key={interval}
								onClick={() => handleSimpleIntervalSelect(interval)}
								className="flex items-center justify-between"
							>
								{SIMPLE_INTERVALS[interval]}
								{selectedInterval === interval && (
									<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
								)}
							</DropdownMenuItem>
						))}

					{/* Intervals with bin size submenus */}
					{Object.keys(BIN_SIZE_INTERVALS)
						.filter((interval) => {
							if (!shouldShowBillingCycleOptions) {
								return interval !== "3bc";
							}
							return true;
						})
						.map((interval) => (
							<DropdownMenuSub key={interval}>
								<DropdownMenuSubTrigger className="flex items-center justify-between">
									{BIN_SIZE_INTERVALS[interval]}
									{selectedInterval === interval && (
										<Check className="mr-1 h-3 w-3 text-tertiary-foreground" />
									)}
								</DropdownMenuSubTrigger>
								<DropdownMenuSubContent>
									{Object.entries(BIN_SIZE_LABELS).map(([binSize, label]) => (
										<DropdownMenuItem
											key={binSize}
											onClick={() =>
												handleBinSizeIntervalSelect({ interval, binSize })
											}
											className="flex items-center justify-between"
										>
											{label}
											{selectedInterval === interval &&
												selectedBinSize === binSize && (
													<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
												)}
										</DropdownMenuItem>
									))}
								</DropdownMenuSubContent>
							</DropdownMenuSub>
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
				</DropdownMenuContent>
			</DropdownMenu>
			<SelectFeatureDropdown />
			<SelectGroupByDropdown propertyKeys={propertyKeys ?? []} />
		</div>
	);
};
