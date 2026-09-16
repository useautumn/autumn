import {
	Calendar,
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
	IconButton,
} from "@autumn/ui";
import { CalendarBlankIcon, CaretDownIcon } from "@phosphor-icons/react";
import { endOfDay, format, subMonths } from "date-fns";
import { Check } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

import { useAnalyticsContext } from "../AnalyticsContext";
import { useAnalyticsQueryState } from "../hooks/useAnalyticsQueryState";
import {
	BILLING_CYCLE_INTERVALS,
	CUSTOM_INTERVAL,
	GRANULARITY_LABELS,
	type Granularity,
	getEffectiveBinSize,
	granularitiesFor,
	INTERVAL_LABELS,
} from "../utils/intervals";
import { CustomerComboBox } from "./CustomerComboBox";
import { SelectEntityDropdown } from "./SelectEntityDropdown";
import { SelectFeatureDropdown } from "./SelectFeatureDropdown";
import { SelectGroupByDropdown } from "./SelectGroupByDropdown";

const getDisplayLabel = ({
	interval,
	binSize,
	customRange,
}: {
	interval: string;
	binSize: Granularity;
	customRange?: DateRange;
}): string => {
	if (interval === CUSTOM_INTERVAL) {
		if (customRange?.from && customRange?.to) {
			return `${format(customRange.from, "MMM d")} - ${format(customRange.to, "MMM d")}`;
		}
		return "Custom range";
	}
	const granularities = granularitiesFor(interval);
	const label = INTERVAL_LABELS[interval];
	if (granularities.length > 1 && binSize !== granularities[0]) {
		return `${label} (${GRANULARITY_LABELS[binSize]})`;
	}
	return label;
};

export const QueryTopbar = () => {
	const { customer, bcExclusionFlag, propertyKeys } = useAnalyticsContext();
	const { queryStates, setQueryStates } = useAnalyticsQueryState();
	const [draftRange, setDraftRange] = useState<DateRange | undefined>(
		undefined,
	);

	const { interval: selectedInterval, start, end } = queryStates;
	const granularities = granularitiesFor(selectedInterval);
	const effectiveBinSize = getEffectiveBinSize({
		interval: selectedInterval,
		binSize: queryStates.bin_size,
	});
	const showGranularity = granularities.length > 1;
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
			bin_size: granularitiesFor(CUSTOM_INTERVAL)[0],
			start: range.from.getTime(),
			end: endOfDay(range.to).getTime(),
		});
	};

	const shouldShowBillingCycleOptions = !bcExclusionFlag && customer;
	const visibleIntervals = Object.keys(INTERVAL_LABELS).filter(
		(interval) =>
			shouldShowBillingCycleOptions || !BILLING_CYCLE_INTERVALS.has(interval),
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
							{INTERVAL_LABELS[interval]}
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

					{showGranularity && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuLabel>Granularity</DropdownMenuLabel>
								{granularities.map((binSize) => (
									<DropdownMenuItem
										key={binSize}
										closeOnClick={false}
										onClick={() => handleBinSizeSelect(binSize)}
										className="flex items-center justify-between"
									>
										{GRANULARITY_LABELS[binSize]}
										{effectiveBinSize === binSize && (
											<Check className="ml-2 h-3 w-3 text-tertiary-foreground" />
										)}
									</DropdownMenuItem>
								))}
							</DropdownMenuGroup>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<SelectFeatureDropdown />
			<SelectGroupByDropdown propertyKeys={propertyKeys ?? []} />
		</div>
	);
};
