import {
	BILLING_CYCLE_INTERVALS,
	type BillingCycleIntervalEnum,
	type BillingCycleResult,
	type ClickHouseResult,
	type TimeseriesEventsParams,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { addDays, addHours, addMonths, format, sub } from "date-fns";
import { Decimal } from "decimal.js";
import {
	type AggregateGroupablePipeRow,
	type AggregateSimplePipeRow,
	getTinybirdPipes,
} from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getBillingCycleStartDate } from "../analyticsUtils.js";

const DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

/** Validates and sanitizes timezone string to prevent injection */
const sanitizeTimezone = ({ timezone }: { timezone?: string }): string => {
	if (!timezone) return "UTC";
	if (!/^[a-zA-Z0-9_/+-]+$/.test(timezone)) return "UTC";
	if (timezone.length > 50) return "UTC";
	return timezone;
};

/** Maps interval type to number of days */
const intervalToDays = ({
	interval,
	billingCycleGap,
}: {
	interval: string;
	billingCycleGap?: number;
}): number => {
	const map: Record<string, number> = {
		"24h": 1,
		"7d": 7,
		"30d": 30,
		"90d": 90,
		"1bc": (billingCycleGap ?? 0) + 1,
		"3bc": (billingCycleGap ?? 0) + 1,
		last_cycle: (billingCycleGap ?? 0) + 1,
	};
	return map[interval] ?? 7;
};

/** Calculates start and end dates for the query */
const calculateDateRange = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: TimeseriesEventsParams;
}): Promise<{ startDate: string; endDate: string }> => {
	const { db } = ctx;
	const intervalType = params.interval ?? "24h";

	// Custom range takes precedence
	if (params.custom_range) {
		return {
			startDate: format(new UTCDate(params.custom_range.start), DATE_FORMAT),
			endDate: format(new UTCDate(params.custom_range.end), DATE_FORMAT),
		};
	}

	// Billing cycle intervals require looking up customer's billing cycle
	const isBillingCycle = BILLING_CYCLE_INTERVALS.includes(
		intervalType as BillingCycleIntervalEnum,
	);

	if (isBillingCycle && !params.aggregateAll && params.customer) {
		const billingCycleResult = (await getBillingCycleStartDate(
			params.customer,
			db,
			intervalType as "1bc" | "3bc" | "last_cycle",
		)) as BillingCycleResult | null;

		if (billingCycleResult?.startDate && billingCycleResult?.endDate) {
			return {
				startDate: billingCycleResult.startDate,
				endDate: billingCycleResult.endDate,
			};
		}
	}

	// Standard intervals: calculate from now
	const now = new UTCDate();
	const days = intervalToDays({ interval: intervalType });
	const startDate = sub(now, { days });

	return {
		startDate: format(startDate, DATE_FORMAT),
		endDate: format(now, DATE_FORMAT),
	};
};

/** Generates all periods between start and end dates based on bin size */
const generateAllPeriods = ({
	startDate,
	endDate,
	binSize,
}: {
	startDate: string;
	endDate: string;
	binSize: string;
}): string[] => {
	const periods: string[] = [];
	let current = new UTCDate(startDate);
	const end = new UTCDate(endDate);

	// Truncate to bin start
	if (binSize === "hour") {
		current = new UTCDate(
			current.getFullYear(),
			current.getMonth(),
			current.getDate(),
			current.getHours(),
			0,
			0,
			0,
		);
	} else if (binSize === "month") {
		current = new UTCDate(current.getFullYear(), current.getMonth(), 1);
	} else {
		// day
		current = new UTCDate(
			current.getFullYear(),
			current.getMonth(),
			current.getDate(),
		);
	}

	while (current <= end) {
		periods.push(format(current, "yyyy-MM-dd HH:mm:ss"));
		if (binSize === "hour") {
			current = addHours(current, 1);
		} else if (binSize === "month") {
			current = addMonths(current, 1);
		} else {
			current = addDays(current, 1);
		}
	}

	return periods;
};

/** Builds column name based on event name, group value, and noCount flag */
const buildColumnName = ({
	eventName,
	noCount,
}: {
	eventName: string;
	noCount?: boolean;
}): string => {
	return noCount ? eventName : `${eventName}_count`;
};

/** Formats simple pipe results (no grouping) into pivoted format */
const formatSimpleResults = ({
	rows,
	eventNames,
	noCount,
	startDate,
	endDate,
	binSize,
}: {
	rows: AggregateSimplePipeRow[];
	eventNames: string[];
	noCount?: boolean;
	startDate: string;
	endDate: string;
	binSize: string;
}): ClickHouseResult => {
	const allPeriods = generateAllPeriods({ startDate, endDate, binSize });

	// Initialize with all periods and all event columns set to 0
	const periodMap = new Map<string, Record<string, number>>();
	for (const period of allPeriods) {
		const record: Record<string, number> = {};
		for (const eventName of eventNames) {
			record[buildColumnName({ eventName, noCount })] = 0;
		}
		periodMap.set(period, record);
	}

	// Fill in actual data
	for (const row of rows) {
		const periodData = periodMap.get(row.period);
		if (!periodData) continue;

		const columnName = buildColumnName({ eventName: row.event_name, noCount });
		if (eventNames.includes(row.event_name)) {
			periodData[columnName] = new Decimal(row.total_value)
				.toDecimalPlaces(10)
				.toNumber();
		}
	}

	const data = Array.from(periodMap.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([period, values]) => ({ period, ...values }));

	const columnNames = eventNames.map((name) =>
		buildColumnName({ eventName: name, noCount }),
	);
	const meta = [{ name: "period" }, ...columnNames.map((name) => ({ name }))];

	return { meta, rows: data.length, data };
};

/** Formats groupable pipe results (with grouping) into unpivoted format */
const formatGroupableResults = ({
	rows,
	eventNames,
	groupBy,
	noCount,
	startDate,
	endDate,
	binSize,
}: {
	rows: AggregateGroupablePipeRow[];
	eventNames: string[];
	groupBy: string;
	noCount?: boolean;
	startDate: string;
	endDate: string;
	binSize: string;
}): ClickHouseResult => {
	const allPeriods = generateAllPeriods({ startDate, endDate, binSize });
	// groupBy already comes with "properties." prefix from frontend
	const groupByColumn = groupBy;

	// Collect all unique group values from the results
	const allGroupValues = new Set<string>();
	for (const row of rows) {
		if (row.group_value) {
			allGroupValues.add(row.group_value);
		}
	}

	// Build a map of (period, groupValue) -> { event_name: value }
	const dataMap = new Map<string, Map<string, Record<string, number>>>();

	// Initialize all (period, groupValue) combinations with zeros
	for (const period of allPeriods) {
		const groupMap = new Map<string, Record<string, number>>();
		for (const groupValue of allGroupValues) {
			const record: Record<string, number> = {};
			for (const eventName of eventNames) {
				record[buildColumnName({ eventName, noCount })] = 0;
			}
			groupMap.set(groupValue, record);
		}
		dataMap.set(period, groupMap);
	}

	// Fill in actual data
	for (const row of rows) {
		if (!row.group_value) continue;

		const groupMap = dataMap.get(row.period);
		if (!groupMap) continue;

		const record = groupMap.get(row.group_value);
		if (!record) continue;

		if (eventNames.includes(row.event_name)) {
			const columnName = buildColumnName({
				eventName: row.event_name,
				noCount,
			});
			record[columnName] = new Decimal(row.total_value)
				.toDecimalPlaces(10)
				.toNumber();
		}
	}

	// Flatten to array of rows with properties.{groupBy} column
	const data: Record<string, string | number>[] = [];
	for (const [period, groupMap] of dataMap) {
		for (const [groupValue, values] of groupMap) {
			data.push({
				period,
				[groupByColumn]: groupValue,
				...values,
			});
		}
	}

	// Sort by period then group value (but put "Other" last within each period)
	data.sort((a, b) => {
		const periodCompare = String(a.period).localeCompare(String(b.period));
		if (periodCompare !== 0) return periodCompare;
		// Put "Other" last
		const aIsOther = a[groupByColumn] === "Other";
		const bIsOther = b[groupByColumn] === "Other";
		if (aIsOther && !bIsOther) return 1;
		if (!aIsOther && bIsOther) return -1;
		return String(a[groupByColumn]).localeCompare(String(b[groupByColumn]));
	});

	// Build meta with properties.{groupBy} column
	const columnNames = eventNames.map((name) =>
		buildColumnName({ eventName: name, noCount }),
	);
	const meta = [
		{ name: "period" },
		{ name: groupByColumn },
		...columnNames.map((name) => ({ name })),
	];

	return { meta, rows: data.length, data };
};

/** Aggregates events into time-bucketed timeseries data */
export const aggregate = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: TimeseriesEventsParams;
}): Promise<{ formatted: ClickHouseResult; truncated: boolean }> => {
	const pipes = getTinybirdPipes();
	const { org, env } = ctx;

	const intervalType = params.interval ?? "24h";
	const timezone = sanitizeTimezone({ timezone: params.timezone });
	const binSize = params.bin_size ?? (intervalType === "24h" ? "hour" : "day");

	const { startDate, endDate } = await calculateDateRange({ ctx, params });

	const startTime = performance.now();
	let formatted: ClickHouseResult;
	let truncated = false;

	// Route to appropriate pipe based on whether grouping is requested
	if (params.group_by) {
		// Use aggregate_groupable pipe for grouped queries
		// Strip "properties." prefix for property_key (pipe expects just the key name)
		const propertyKey = params.group_by.startsWith("properties.")
			? params.group_by.slice("properties.".length)
			: params.group_by;

		const pipeParams = {
			org_id: org.id,
			env,
			event_names: params.event_names,
			start_date: startDate,
			end_date: endDate,
			bin_size: binSize,
			timezone,
			customer_id: params.aggregateAll ? undefined : params.customer_id,
			property_key: propertyKey,
		};

		ctx.logger.debug("Calling Tinybird aggregate_groupable pipe", {
			pipeParams,
		});

		const result = await pipes.aggregateGroupable(pipeParams);

		// Extract truncation flag from first row (all rows have the same value)
		truncated = result.data.length > 0 && result.data[0]._truncated === true;

		formatted = formatGroupableResults({
			rows: result.data,
			eventNames: params.event_names,
			groupBy: params.group_by,
			noCount: params.no_count,
			startDate,
			endDate,
			binSize,
		});

		ctx.logger.debug("Aggregate groupable results", {
			queryMs: Math.round(performance.now() - startTime),
			rawRows: result.data.length,
			rawSample: result.data.slice(0, 3),
			formattedRows: formatted.rows,
			formattedSample: formatted.data.slice(0, 3),
			columns: formatted.meta.map((m) => m.name),
			truncated,
		});
	} else {
		// Use aggregate_simple pipe for ungrouped queries
		const pipeParams = {
			org_id: org.id,
			env,
			event_names: params.event_names,
			start_date: startDate,
			end_date: endDate,
			bin_size: binSize,
			timezone,
			customer_id: params.aggregateAll ? undefined : params.customer_id,
		};

		ctx.logger.debug("Calling Tinybird aggregate_simple pipe", { pipeParams });

		const result = await pipes.aggregateSimple(pipeParams);

		formatted = formatSimpleResults({
			rows: result.data,
			eventNames: params.event_names,
			noCount: params.no_count,
			startDate,
			endDate,
			binSize,
		});

		ctx.logger.debug("Aggregate simple results", {
			queryMs: Math.round(performance.now() - startTime),
			rawRows: result.data.length,
			rawSample: result.data.slice(0, 3),
			formattedRows: formatted.rows,
			formattedSample: formatted.data.slice(0, 3),
			columns: formatted.meta.map((m) => m.name),
		});
	}

	return { formatted, truncated };
};
