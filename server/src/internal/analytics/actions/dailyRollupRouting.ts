export type GroupableColumn =
	| "property"
	| "customer_id"
	| "entity_id"
	| "plan_id";

export type CountAndSumSource =
	| "raw_events"
	| "org_hourly"
	| "customer_hourly"
	| "customer_daily";

const DAILY_BIN_SIZES = new Set(["day", "week", "month"]);
const MILLISECONDS_PER_DAY = 86_400_000;

const parseUtcTimestamp = ({ value }: { value: string }): number => {
	const normalized = value.replace(" ", "T").replace(/Z$/, "");
	return Date.parse(`${normalized}Z`);
};

export const hasCompleteUtcDay = ({
	startDate,
	endDate,
}: {
	startDate: string;
	endDate: string;
}): boolean => {
	const startTimestamp = parseUtcTimestamp({ value: startDate });
	const endTimestamp = parseUtcTimestamp({ value: endDate });
	if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
		return false;
	}

	const startDay =
		Math.floor(startTimestamp / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY;
	const firstFullDay =
		startTimestamp === startDay ? startDay : startDay + MILLISECONDS_PER_DAY;
	const endDay =
		Math.floor(endTimestamp / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY;

	return firstFullDay < endDay;
};

export const shouldUsePropertyDailyRollup = ({
	binSize,
	endDate,
	groupColumn,
	hasPropertyFilters,
	skipPropertyRollup,
	startDate,
	timezone,
}: {
	binSize: string;
	endDate: string;
	groupColumn: GroupableColumn;
	hasPropertyFilters: boolean;
	skipPropertyRollup: boolean;
	startDate: string;
	timezone: string;
}): boolean =>
	groupColumn === "property" &&
	!hasPropertyFilters &&
	!skipPropertyRollup &&
	DAILY_BIN_SIZES.has(binSize) &&
	hasCompleteUtcDay({ startDate, endDate }) &&
	timezone === "UTC";

export const selectCountAndSumSource = ({
	hasCustomerId,
	hasEntityId,
	hasPropertyFilters,
	containsCompleteUtcDay,
}: {
	hasCustomerId: boolean;
	hasEntityId: boolean;
	hasPropertyFilters: boolean;
	containsCompleteUtcDay: boolean;
}): CountAndSumSource => {
	if (hasPropertyFilters) return "raw_events";
	if (!hasCustomerId && !hasEntityId) return "org_hourly";
	return containsCompleteUtcDay ? "customer_daily" : "customer_hourly";
};

const customerFilterSql = ({
	aggregateAll,
}: {
	aggregateAll: boolean;
}): string => (aggregateAll ? "" : "AND customer_id = {customer_id:String}");

const entityFilterSql = ({ hasEntityId }: { hasEntityId: boolean }): string =>
	hasEntityId ? "AND entity_id = {entity_id:String}" : "";

const fullDayStartSql = `if(
	{start_date:DateTime} = toStartOfDay({start_date:DateTime}),
	toStartOfDay({start_date:DateTime}),
	addDays(toStartOfDay({start_date:DateTime}), 1)
)`;

export const buildCountAndSumQuery = ({
	source,
	aggregateAll = false,
	filterBySql = "",
	hasEntityId = false,
}: {
	source: CountAndSumSource;
	aggregateAll?: boolean;
	filterBySql?: string;
	hasEntityId?: boolean;
}): string => {
	if (source === "raw_events") {
		return `
			SELECT event_name, COUNT(*) as count, SUM(coalesce(value, 1)) as sum
			FROM events
			WHERE org_id = {org_id:String} AND env = {env:String}
				${customerFilterSql({ aggregateAll })}
				${entityFilterSql({ hasEntityId })}${filterBySql}
				AND timestamp >= {start_date:DateTime} AND timestamp <= {end_date:DateTime}
				AND event_name IN {event_names:Array(String)}
			GROUP BY event_name
		`;
	}

	if (source === "org_hourly") {
		return `
			SELECT event_name, sum(event_count) as count, sum(total_value) as sum
			FROM events_org_hourly_mv
			WHERE org_id = {org_id:String} AND env = {env:String}
				AND hour >= {start_date:DateTime} AND hour <= {end_date:DateTime}
				AND event_name IN {event_names:Array(String)}
			GROUP BY event_name
		`;
	}

	if (source === "customer_hourly") {
		return `
			SELECT event_name, sum(event_count) as count, sum(total_value) as sum
			FROM events_customer_hourly_mv
			WHERE org_id = {org_id:String} AND env = {env:String}
				${customerFilterSql({ aggregateAll })}
				${entityFilterSql({ hasEntityId })}
				AND hour >= {start_date:DateTime} AND hour <= {end_date:DateTime}
				AND event_name IN {event_names:Array(String)}
			GROUP BY event_name
		`;
	}

	const customerFilter = customerFilterSql({ aggregateAll });
	const entityFilter = entityFilterSql({ hasEntityId });

	return `
		SELECT
			event_name,
			sum(event_count_value) as count,
			sum(total_value_value) as sum,
			max(daily_rollup_days) as daily_rollup_days,
			max(expected_daily_days) as expected_daily_days,
			max(is_daily_rollup_coverage) as is_daily_rollup_coverage
		FROM (
			SELECT
				event_name,
				sumMerge(event_count) as event_count_value,
				sumMerge(total_value) as total_value_value,
				0 as daily_rollup_days,
				0 as expected_daily_days,
				0 as is_daily_rollup_coverage
			FROM events_customer_daily_mv
			WHERE org_id = {org_id:String} AND env = {env:String}
				${customerFilter}
				${entityFilter}
				AND day >= ${fullDayStartSql}
				AND day < toStartOfDay({end_date:DateTime})
				AND event_name IN {event_names:Array(String)}
			GROUP BY event_name

			UNION ALL

			SELECT
				event_name,
				sum(event_count) as event_count_value,
				sum(total_value) as total_value_value,
				0 as daily_rollup_days,
				0 as expected_daily_days,
				0 as is_daily_rollup_coverage
			FROM events_customer_hourly_mv
			WHERE org_id = {org_id:String} AND env = {env:String}
				${customerFilter}
				${entityFilter}
				AND hour >= {start_date:DateTime} AND hour <= {end_date:DateTime}
				AND (hour < ${fullDayStartSql} OR hour >= toStartOfDay({end_date:DateTime}))
				AND event_name IN {event_names:Array(String)}
			GROUP BY event_name

			UNION ALL

			SELECT
				'' as event_name,
				0 as event_count_value,
				0 as total_value_value,
				(
					SELECT uniqExact(day)
					FROM events_customer_daily_coverage_mv
					WHERE day >= ${fullDayStartSql}
						AND day < toStartOfDay({end_date:DateTime})
				) as daily_rollup_days,
				dateDiff('day', ${fullDayStartSql}, toStartOfDay({end_date:DateTime})) as expected_daily_days,
				1 as is_daily_rollup_coverage
		)
		GROUP BY event_name
	`;
};
