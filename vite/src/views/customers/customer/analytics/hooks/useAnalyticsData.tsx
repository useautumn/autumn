import { ErrCode, LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { fetchEventsAggregate } from "../api/fetchEventsAggregate";
import { fetchEventsList } from "../api/fetchEventsList";
import { fetchGroupDisplayNames } from "../api/fetchGroupDisplayNames";
import { aggregateListToEventsData } from "../utils/aggregateListToEventsData";
import { SOURCE_FEATURE_GROUP } from "../utils/displayLabels";
import { isUtcBin } from "../utils/epochToPeriodString";
import { getUserTimezone } from "../utils/getUserTimezone";
import { groupByToColumn } from "../utils/groupByColumn";
import { getEffectiveBinSize } from "../utils/intervals";
import { useAnalyticsCustomer } from "./useAnalyticsCustomer";
import { useAnalyticsFilterState } from "./useAnalyticsFilterState";
import { useAnalyticsQueryState } from "./useAnalyticsQueryState";
import { useSelectedEventNames } from "./useSelectedEventNames";

const isAnalyticsDisabledError = (error: unknown) =>
	(error as { code?: string } | null)?.code === ErrCode.ClickHouseDisabled;

export const useAnalyticsData = ({
	hasCleared = false,
}: {
	hasCleared?: boolean;
}) => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const internalAxiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { filterStates } = useAnalyticsFilterState();
	const {
		customer_id: customerId,
		entity_id: entityId,
		group_by: groupBy,
		max_groups: maxGroups,
	} = filterStates;

	const { customer, bcExclusionFlag } = useAnalyticsCustomer({ customerId });

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;
	// Resolve the bin here rather than letting the server default it: a range's
	// default granularity is a UI decision, and the two must not drift.
	const binSize = getEffectiveBinSize({
		interval,
		binSize: queryStates.bin_size,
	});
	// The deduction rollup is keyed by customer, so it cannot run org-wide.
	const aggregateOn =
		queryStates.aggregate_on === "deducted" && customerId
			? "deducted"
			: undefined;
	const customRange =
		interval === "custom" && start && end ? { start, end } : undefined;

	const {
		selectedEventNames,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	} = useSelectedEventNames();

	const timezone = useMemo(() => getUserTimezone(), []);
	// Month bins are requested in UTC so they can be served from the monthly
	// rollups, which key on UTC month starts; a local month never aligns with one.
	const effectiveTimezone = binSize === "month" ? "UTC" : timezone;
	const utcPeriods = isUtcBin({ binSize, timezone: effectiveTimezone });

	// Deducted mode defaults to splitting by which tracked feature caused the
	// deduction — the story the mode exists to tell. An explicit group_by wins.
	const effectiveGroupBy =
		!groupBy && aggregateOn ? SOURCE_FEATURE_GROUP : groupBy;
	// Source-feature grouping only splits the deductions; the usage series stays whole.
	const eventsGroupColumn =
		effectiveGroupBy && effectiveGroupBy !== SOURCE_FEATURE_GROUP
			? groupByToColumn({ groupBy: effectiveGroupBy })
			: undefined;

	const isReady =
		!eventNamesLoading && !featuresLoading && selectedEventNames.length > 0;

	const { data, isLoading, error } = useQuery({
		enabled: isReady,
		queryKey: buildKey([
			"events-aggregate",
			customerId,
			entityId,
			interval,
			binSize,
			String(start ?? ""),
			String(end ?? ""),
			...[...selectedEventNames].sort(),
			effectiveGroupBy,
			effectiveTimezone,
			String(maxGroups),
			aggregateOn ?? "",
		]),
		// Names load in the same step as the chart so rows never flash raw ids.
		queryFn: async () => {
			const aggregate = await fetchEventsAggregate({
				axiosInstance,
				customerId,
				entityId,
				featureIds: selectedEventNames,
				interval,
				binSize,
				customRange,
				groupBy: effectiveGroupBy,
				maxGroups,
				aggregateOn,
				timezone: effectiveTimezone,
			});
			const displayNames = await fetchGroupDisplayNames({
				axiosInstance: internalAxiosInstance,
				groupBy: eventsGroupColumn ? effectiveGroupBy : null,
				list: aggregate.list,
			});
			return { ...aggregate, displayNames };
		},
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	});

	const events = useMemo(
		() =>
			data
				? aggregateListToEventsData({
						list: data.list,
						featureIds: selectedEventNames,
						groupColumn: eventsGroupColumn,
						utc: utcPeriods,
					})
				: undefined,
		[data, selectedEventNames, eventsGroupColumn, utcPeriods],
	);

	const { customerNames, entityNames, planNames } = data?.displayNames ?? {};

	const queryLoading = eventNamesLoading || featuresLoading || isLoading;

	return {
		customer,
		deductions: data?.deductions,
		aggregateOn,
		features: featuresData || [],
		featuresLoading,
		queryLoading,
		events,
		utcPeriods,
		error: isAnalyticsDisabledError(error) ? null : error,
		bcExclusionFlag,
		groupBy,
		entityNames,
		customerNames,
		planNames,
		totals: data?.total,
		eventNames: selectedEventNames,
	};
};

export const useRawAnalyticsData = () => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const { filterStates } = useAnalyticsFilterState();
	const { customer_id: customerId, entity_id: entityId } = filterStates;

	const { queryStates } = useAnalyticsQueryState();
	const { interval, start, end } = queryStates;
	// The table must cover the chart's window, so it resolves the bin the same way.
	const binSize = getEffectiveBinSize({
		interval,
		binSize: queryStates.bin_size,
	});
	const customRange =
		interval === "custom" && start && end ? { start, end } : undefined;

	const {
		selectedEventNames,
		hasExplicitSelection,
		featuresData,
		featuresLoading,
		eventNamesLoading,
	} = useSelectedEventNames();

	const isReady = !eventNamesLoading && !featuresLoading;

	const tableEventNames = hasExplicitSelection ? selectedEventNames : undefined;

	const { data, isLoading, error } = useQuery({
		enabled: isReady,
		queryKey: buildKey([
			"events-list",
			customerId,
			entityId,
			interval,
			binSize,
			String(start ?? ""),
			String(end ?? ""),
			...[...(tableEventNames ?? [])].sort(),
		]),
		queryFn: () =>
			fetchEventsList({
				axiosInstance,
				customerId,
				entityId,
				featureIds: tableEventNames,
				interval,
				binSize,
				customRange,
			}),
		staleTime: 30 * 1000,
		refetchOnWindowFocus: true,
	});

	const queryLoading = !isReady || isLoading;

	return {
		features: featuresData || [],
		featuresLoading,
		queryLoading,
		rawEvents: data ? { data: data.events } : undefined,
		error: isAnalyticsDisabledError(error) ? null : error,
	};
};
