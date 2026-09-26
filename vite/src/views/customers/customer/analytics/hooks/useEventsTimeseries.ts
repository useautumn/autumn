import { ErrCode, LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { fetchEventsAggregate } from "../api/fetchEventsAggregate";
import { aggregateListToEventsData } from "../utils/aggregateListToEventsData";
import { isUtcBin } from "../utils/epochToPeriodString";
import { getUserTimezone } from "../utils/getUserTimezone";

/** An ungrouped usage series per event over a preset range, e.g. for small inline charts. */
export const useEventsTimeseries = ({
	customerId,
	interval,
	eventNames,
	enabled = true,
}: {
	customerId?: string | null;
	interval: string;
	eventNames: string[];
	enabled?: boolean;
}) => {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	const timezone = useMemo(() => getUserTimezone(), []);
	const binSize = interval === "24h" ? "hour" : "day";

	const { data, isLoading, error } = useQuery({
		queryKey: buildKey([
			"events-timeseries",
			customerId,
			interval,
			timezone,
			...[...eventNames].sort(),
		]),
		queryFn: () =>
			fetchEventsAggregate({
				axiosInstance,
				customerId,
				featureIds: eventNames,
				interval,
				binSize,
				timezone,
			}),
		enabled: enabled && eventNames.length > 0,
	});

	const timeseriesEvents = useMemo(
		() =>
			data
				? aggregateListToEventsData({
						list: data.list,
						featureIds: eventNames,
						utc: isUtcBin({ binSize, timezone }),
					})
				: undefined,
		[data, eventNames, binSize, timezone],
	);

	return {
		timeseriesEvents,
		totals: data?.total,
		isLoading,
		error:
			(error as { code?: string } | null)?.code === ErrCode.ClickHouseDisabled
				? null
				: error,
	};
};
