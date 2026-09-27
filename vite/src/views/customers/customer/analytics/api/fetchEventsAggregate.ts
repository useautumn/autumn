import type { EventsAggregateResponseV1 } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { SOURCE_FEATURE_GROUP } from "../utils/displayLabels";
import { isBuiltInGroupBy } from "../utils/groupByColumn";
import { monthRangeWindow } from "../utils/monthRangeWindow";

/** Maps the dashboard's group-by value onto events.aggregate's `group_by`. */
const toPublicGroupBy = ({ groupBy }: { groupBy?: string | null }) => {
	if (!groupBy) return undefined;
	if (groupBy === SOURCE_FEATURE_GROUP) return "$feature_id";
	if (isBuiltInGroupBy({ groupBy })) return `$${groupBy}`;
	return `properties.${groupBy}`;
};

/** A preset range, unless it's a custom window or a month range the API lacks. */
const toRangeParams = ({
	interval,
	binSize,
	customRange,
}: {
	interval: string;
	binSize: string;
	customRange?: { start: number; end: number };
}) => {
	const window = customRange ?? monthRangeWindow({ interval, binSize });
	return window ? { custom_range: window } : { range: interval };
};

/** Callers pass an axios instance pinned to LATEST_VERSION for the V1 response shape. */
export const fetchEventsAggregate = async ({
	axiosInstance,
	customerId,
	entityId,
	featureIds,
	interval,
	binSize,
	customRange,
	groupBy,
	maxGroups,
	aggregateOn,
	timezone,
}: {
	axiosInstance: AxiosInstance;
	customerId?: string | null;
	entityId?: string | null;
	featureIds: string[];
	interval: string;
	binSize: string;
	customRange?: { start: number; end: number };
	groupBy?: string | null;
	maxGroups?: number | null;
	aggregateOn?: "deducted";
	timezone: string;
}): Promise<EventsAggregateResponseV1> => {
	const publicGroupBy = toPublicGroupBy({ groupBy });
	const { data } = await axiosInstance.post<EventsAggregateResponseV1>(
		"/v1/events.aggregate",
		{
			customer_id: customerId || undefined,
			entity_id: entityId || undefined,
			feature_id: featureIds,
			...toRangeParams({ interval, binSize, customRange }),
			bin_size: binSize,
			timezone,
			group_by: publicGroupBy,
			max_groups: publicGroupBy ? (maxGroups ?? undefined) : undefined,
			aggregate_on: aggregateOn,
		},
	);
	return data;
};
