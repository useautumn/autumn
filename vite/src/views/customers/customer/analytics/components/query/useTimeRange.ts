import { endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useAnalyticsContext } from "../../AnalyticsContext";
import { useAnalyticsQueryState } from "../../hooks/useAnalyticsQueryState";
import {
	BILLING_CYCLE_INTERVALS,
	CUSTOM_INTERVAL,
	getEffectiveBinSize,
	granularitiesFor,
	INTERVAL_LABELS,
} from "../../utils/intervals";

/** Range presets, custom range and bin size, shared by every time control. */
export const useTimeRange = () => {
	const { customer, bcExclusionFlag } = useAnalyticsContext();
	const { queryStates, setQueryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;

	const customRange =
		interval === CUSTOM_INTERVAL && start && end
			? { from: new Date(start), to: new Date(end) }
			: undefined;

	// Billing-cycle ranges need a customer's cycle to anchor on.
	const showsBillingCycles = Boolean(customer) && !bcExclusionFlag;
	const presetIntervals = Object.keys(INTERVAL_LABELS).filter(
		(preset) => showsBillingCycles || !BILLING_CYCLE_INTERVALS.has(preset),
	);

	const selectPreset = (preset: string) =>
		setQueryStates({
			interval: preset,
			bin_size: getEffectiveBinSize({
				interval: preset,
				binSize: queryStates.bin_size,
			}),
			start: null,
			end: null,
		});

	const selectCustomRange = (range: DateRange | undefined) => {
		if (!range?.from || !range?.to) return;
		setQueryStates({
			interval: CUSTOM_INTERVAL,
			bin_size: granularitiesFor(CUSTOM_INTERVAL)[0],
			start: range.from.getTime(),
			end: endOfDay(range.to).getTime(),
		});
	};

	return {
		interval,
		customRange,
		presetIntervals,
		selectPreset,
		selectCustomRange,
		granularities: granularitiesFor(interval),
		binSize: getEffectiveBinSize({ interval, binSize: queryStates.bin_size }),
		setBinSize: (binSize: string) => setQueryStates({ bin_size: binSize }),
	};
};
