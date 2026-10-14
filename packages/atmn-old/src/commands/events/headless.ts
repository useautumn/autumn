import { AppEnv } from "../../lib/env/detect.js";
import { getKey } from "../../lib/env/keys.js";
import {
	fetchEvents,
	fetchEventsAggregate,
	type AggregateBinSize,
	type AggregateRange,
	type ApiEventsListItem,
} from "../../lib/api/endpoints/events.js";
import { fetchFeatures } from "../../lib/api/endpoints/features.js";
import { formatError } from "../../lib/api/client.js";

export interface HeadlessEventsOptions {
	prod?: boolean;
	page?: number;
	limit?: number;
	format?: "text" | "json" | "csv";
	customerId?: string;
	featureId?: string;
	timeRange?: "24h" | "7d" | "30d" | "90d";
	mode?: "list" | "aggregate";
	binSize?: "hour" | "day" | "month";
	groupBy?: string;
}

export async function headlessEventsCommand(
	options: HeadlessEventsOptions,
): Promise<void> {
	const environment = options.prod ? AppEnv.Live : AppEnv.Sandbox;
	const format = options.format ?? "text";
	const mode = options.mode ?? "list";

	try {
		if (mode === "aggregate") {
			await runAggregateMode(options, environment, format);
		} else {
			await runListMode(options, environment, format);
		}
	} catch (error) {
		const message = formatError(error);

		if (format === "json") {
			const apiError = error as { status?: number; response?: unknown };
			console.log(
				JSON.stringify(
					{
						error: error instanceof Error ? error.message : String(error),
						status: apiError.status,
						details: apiError.response,
					},
					null,
					2,
				),
			);
		} else {
			console.error(`Error: ${message}`);
		}

		process.exit(1);
	}
}

async function runListMode(
	options: HeadlessEventsOptions,
	environment: AppEnv,
	format: "text" | "json" | "csv",
): Promise<void> {
	const page = options.page ?? 1;
	const limit = options.limit ?? 100;
	const secretKey = getKey(environment);

	const offset = (page - 1) * limit;

	let customRange: { start?: number; end?: number } | undefined;
	if (options.timeRange) {
		const now = Date.now();
		const ranges: Record<string, number> = {
			"24h": 24 * 60 * 60 * 1000,
			"7d": 7 * 24 * 60 * 60 * 1000,
			"30d": 30 * 24 * 60 * 60 * 1000,
			"90d": 90 * 24 * 60 * 60 * 1000,
		};
		const ms = ranges[options.timeRange];
		if (ms) {
			customRange = { start: now - ms, end: now };
		}
	}

	const response = await fetchEvents({
		secretKey,
		customerId: options.customerId,
		featureId: options.featureId,
		customRange,
		offset,
		limit,
	});

	outputEventList(
		response.list,
		{
			page,
			pageSize: limit,
			total: response.total,
			hasMore: response.has_more,
		},
		format,
		options.customerId,
		options.featureId,
		options.timeRange,
	);
}

async function runAggregateMode(
	options: HeadlessEventsOptions,
	environment: AppEnv,
	format: "text" | "json" | "csv",
): Promise<void> {
	const secretKey = getKey(environment);

	if (!options.customerId) {
		if (format === "json") {
			console.log(
				JSON.stringify(
					{
						error: "Customer ID is required for aggregate mode",
						hint: "Use --customer <id> to specify a customer",
					},
					null,
					2,
				),
			);
		} else {
			console.error("Error: Customer ID is required for aggregate mode.");
			console.error("Use --customer <id> to specify a customer.");
		}
		process.exit(1);
	}

	let featureIds: string[] = [];
	if (options.featureId) {
		featureIds = options.featureId.split(",").map((f) => f.trim());
	} else {
		const featuresResponse = await fetchFeatures({ secretKey });
		featureIds = featuresResponse.map((f) => f.id);
	}

	if (featureIds.length === 0) {
		if (format === "json") {
			console.log(
				JSON.stringify(
					{
						error: "No features available for aggregation",
						hint: "Create features first or specify feature IDs with --feature",
					},
					null,
					2,
				),
			);
		} else {
			console.error("Error: No features available for aggregation.");
			console.error("Create features first or specify feature IDs with --feature.");
		}
		process.exit(1);
	}

	const range: AggregateRange = (options.timeRange as AggregateRange) ?? "7d";
	const binSize: AggregateBinSize = options.binSize ?? (range === "24h" ? "hour" : "day");

	let groupBy = options.groupBy;
	if (groupBy && !groupBy.startsWith("properties.")) {
		groupBy = `properties.${groupBy}`;
	}

	const response = await fetchEventsAggregate({
		secretKey,
		customerId: options.customerId,
		featureId: featureIds,
		range,
		binSize,
		groupBy,
	});

	outputAggregateData(
		response.list,
		response.total,
		format,
		options.customerId,
		featureIds,
		range,
		binSize,
		groupBy,
	);
}

function outputEventList(
	events: ApiEventsListItem[],
	pagination: {
		page: number;
		pageSize: number;
		total: number;
		hasMore: boolean;
	},
	format: "text" | "json" | "csv",
	customerId?: string,
	featureId?: string,
	timeRange?: string,
): void {
	if (format === "json") {
		console.log(
			JSON.stringify(
				{
					mode: "list",
					events,
					pagination: {
						page: pagination.page,
						pageSize: pagination.pageSize,
						total: pagination.total,
						hasMore: pagination.hasMore,
					},
					filters: {
						customerId: customerId ?? null,
						featureId: featureId ?? null,
						timeRange: timeRange ?? null,
					},
				},
				null,
				2,
			),
		);
		return;
	}

	if (format === "csv") {
		console.log("id,timestamp,customer_id,feature_id,value");
		for (const e of events) {
			const timestamp = new Date(normalizeTimestamp(e.timestamp)).toISOString();
			console.log(
				`${e.id},${timestamp},${e.customer_id},${e.feature_id},${e.value}`,
			);
		}
		return;
	}

	const startItem = (pagination.page - 1) * pagination.pageSize + 1;
	const endItem = Math.min(startItem + events.length - 1, pagination.total);
	console.log(
		`Events (Page ${pagination.page}, showing ${startItem}-${endItem} of ${pagination.total})`,
	);
	console.log("=".repeat(70));

	const filters: string[] = [];
	if (customerId) filters.push(`customer: ${customerId}`);
	if (featureId) filters.push(`feature: ${featureId}`);
	if (timeRange) filters.push(`time: ${timeRange}`);
	if (filters.length > 0) {
		console.log(`Filters: ${filters.join(", ")}`);
	}

	console.log("");

	if (events.length === 0) {
		console.log("No events found.");
		console.log("");
		console.log("Actions:");
		console.log("  --customer <id>    Filter by customer ID");
		console.log("  --feature <id>     Filter by feature ID");
		console.log("  --time <range>     Filter by time (24h, 7d, 30d, 90d)");
		console.log("  --mode aggregate   Switch to aggregate view");
		return;
	}

	const idWidth = 20;
	const timestampWidth = 20;
	const customerWidth = 20;
	const featureWidth = 16;
	const valueWidth = 8;

	console.log(
		`${"ID".padEnd(idWidth)}  ${"Timestamp".padEnd(timestampWidth)}  ${"Customer".padEnd(customerWidth)}  ${"Feature".padEnd(featureWidth)}  ${"Value".padEnd(valueWidth)}`,
	);
	console.log("-".repeat(idWidth + timestampWidth + customerWidth + featureWidth + valueWidth + 8));

	for (const e of events) {
		const id = truncate(e.id, idWidth).padEnd(idWidth);
		const timestamp = formatDateTime(e.timestamp).padEnd(timestampWidth);
		const customer = truncate(e.customer_id, customerWidth).padEnd(customerWidth);
		const feature = truncate(e.feature_id, featureWidth).padEnd(featureWidth);
		const value = String(e.value).padEnd(valueWidth);
		console.log(`${id}  ${timestamp}  ${customer}  ${feature}  ${value}`);
	}

	console.log("");
	console.log("Actions:");
	if (pagination.hasMore) {
		console.log(`  --page ${pagination.page + 1}         Next page`);
	}
	console.log("  --customer <id>    Filter by customer ID");
	console.log("  --feature <id>     Filter by feature ID");
	console.log("  --time <range>     Filter by time (24h, 7d, 30d, 90d)");
	console.log("  --mode aggregate   Switch to aggregate view");
}

function outputAggregateData(
	list: Array<{ period: number; [key: string]: number | Record<string, number> }>,
	total: Record<string, { count: number; sum: number }>,
	format: "text" | "json" | "csv",
	customerId: string,
	featureIds: string[],
	range: string,
	binSize: string,
	groupBy?: string,
): void {
	if (format === "json") {
		console.log(
			JSON.stringify(
				{
					mode: "aggregate",
					timeSeries: list,
					totals: total,
					filters: {
						customerId,
						featureIds,
						range,
						binSize,
						groupBy: groupBy ?? null,
					},
				},
				null,
				2,
			),
		);
		return;
	}

	if (format === "csv") {
		const featureColumns = featureIds.join(",");
		console.log(`period,${featureColumns}`);
		for (const bucket of list) {
			const periodStr = new Date(bucket.period).toISOString();
			const values = featureIds.map((fid) => {
				const val = bucket[fid];
				if (typeof val === "number") return val;
				if (typeof val === "object" && val !== null) {
					return Object.values(val).reduce((sum, v) => sum + v, 0);
				}
				return 0;
			});
			console.log(`${periodStr},${values.join(",")}`);
		}
		return;
	}

	console.log(`Aggregate Events (${range}, ${binSize})`);
	console.log("=".repeat(60));
	console.log(`Customer: ${customerId}`);
	console.log(`Features: ${featureIds.join(", ")}`);
	if (groupBy) {
		console.log(`Group by: ${groupBy}`);
	}
	console.log("");

	const totalEntries = Object.entries(total);
	const totalEvents = totalEntries.reduce((sum, [, t]) => sum + t.count, 0);
	const totalValue = totalEntries.reduce((sum, [, t]) => sum + t.sum, 0);

	console.log("Summary:");
	console.log(`  Total events: ${totalEvents.toLocaleString()}`);
	console.log(`  Total value:  ${totalValue.toLocaleString()}`);
	console.log(`  Features:     ${totalEntries.length}`);
	console.log("");

	if (totalEntries.length > 0) {
		console.log("By Feature:");
		for (const [featureId, stats] of totalEntries) {
			console.log(
				`  ${truncate(featureId, 24).padEnd(24)}  ${stats.count.toLocaleString().padStart(8)} events  ${stats.sum.toLocaleString().padStart(10)} total`,
			);
		}
		console.log("");
	}

	if (list.length > 0) {
		console.log("Time Series:");
		renderAsciiChart(list, binSize, groupBy);
		console.log("");
	}

	console.log("Actions:");
	console.log("  --time <range>     Change time range (24h, 7d, 30d, 90d)");
	console.log("  --bin <size>       Change bin size (hour, day, month)");
	console.log("  --group-by <prop>  Group by property");
	console.log("  --mode list        Switch to list view");
}

const GROUP_COLORS = [
	"\x1b[35m",
	"\x1b[34m",
	"\x1b[32m",
	"\x1b[33m",
	"\x1b[36m",
	"\x1b[31m",
];
const RESET_COLOR = "\x1b[0m";

function renderAsciiChart(
	list: Array<{ period: number; [key: string]: number | Record<string, number> }>,
	binSize: string,
	groupBy?: string,
): void {
	const hasGroupedData = list.some((bucket) => {
		for (const [key, value] of Object.entries(bucket)) {
			if (key === "period") continue;
			if (typeof value === "object" && value !== null) {
				return true;
			}
		}
		return false;
	});

	if (hasGroupedData && groupBy) {
		renderStackedChart(list, binSize);
	} else {
		renderSimpleChart(list, binSize);
	}
}

function renderSimpleChart(
	list: Array<{ period: number; [key: string]: number | Record<string, number> }>,
	binSize: string,
): void {
	const buckets = list.map((bucket) => {
		let total = 0;
		for (const [key, value] of Object.entries(bucket)) {
			if (key === "period") continue;
			if (typeof value === "number") {
				total += value;
			} else if (typeof value === "object" && value !== null) {
				total += Object.values(value).reduce((sum, v) => sum + v, 0);
			}
		}
		return { period: bucket.period, total };
	});

	const displayBuckets = buckets.slice(-20);
	const maxValue = Math.max(...displayBuckets.map((b) => b.total), 1);
	const chartHeight = 8;
	const chartWidth = displayBuckets.length;

	for (let row = chartHeight - 1; row >= 0; row--) {
		const threshold = (row / chartHeight) * maxValue;
		let rowStr = row === chartHeight - 1 ? `${maxValue.toString().padStart(6)} |` : "       |";
		for (const bucket of displayBuckets) {
			rowStr += bucket.total > threshold ? "█" : " ";
		}
		console.log(rowStr);
	}

	console.log(`     0 |${"─".repeat(chartWidth)}`);

	if (displayBuckets.length > 0) {
		const firstLabel = formatBucketLabel(displayBuckets[0]!.period, binSize);
		const lastLabel = formatBucketLabel(displayBuckets[displayBuckets.length - 1]!.period, binSize);
		const padding = chartWidth - firstLabel.length - lastLabel.length;
		console.log(`        ${firstLabel}${" ".repeat(Math.max(0, padding))}${lastLabel}`);
	}
}

function renderStackedChart(
	list: Array<{ period: number; [key: string]: number | Record<string, number> }>,
	binSize: string,
): void {
	const allGroups = new Set<string>();
	for (const bucket of list) {
		for (const [key, value] of Object.entries(bucket)) {
			if (key === "period") continue;
			if (typeof value === "object" && value !== null) {
				for (const groupKey of Object.keys(value)) {
					allGroups.add(groupKey);
				}
			}
		}
	}
	const groupKeys = Array.from(allGroups).sort();

	const buckets = list.map((bucket) => {
		const groupValues: Record<string, number> = {};
		let total = 0;

		for (const [key, value] of Object.entries(bucket)) {
			if (key === "period") continue;
			if (typeof value === "object" && value !== null) {
				for (const [groupKey, groupVal] of Object.entries(value)) {
					groupValues[groupKey] = (groupValues[groupKey] ?? 0) + groupVal;
					total += groupVal;
				}
			} else if (typeof value === "number") {
				total += value;
			}
		}

		return { period: bucket.period, total, groupValues };
	});

	const displayBuckets = buckets.slice(-20);
	const maxValue = Math.max(...displayBuckets.map((b) => b.total), 1);
	const chartHeight = 10;
	const chartWidth = displayBuckets.length;

	for (let row = chartHeight - 1; row >= 0; row--) {
		const rowThresholdBottom = (row / chartHeight) * maxValue;
		const rowThresholdTop = ((row + 1) / chartHeight) * maxValue;
		
		let rowStr = row === chartHeight - 1 ? `${maxValue.toString().padStart(6)} |` : "       |";
		
		for (const bucket of displayBuckets) {
			if (bucket.total <= rowThresholdBottom) {
				rowStr += " ";
			} else {
				let cumulative = 0;
				let foundGroup = false;
				
			for (let i = 0; i < groupKeys.length; i++) {
				const groupKey = groupKeys[i];
				if (!groupKey) continue;
				const groupVal = bucket.groupValues[groupKey] ?? 0;
					const prevCumulative = cumulative;
					cumulative += groupVal;
					
					if (cumulative > rowThresholdBottom && prevCumulative < rowThresholdTop) {
						const color = GROUP_COLORS[i % GROUP_COLORS.length];
						rowStr += `${color}█${RESET_COLOR}`;
						foundGroup = true;
						break;
					}
				}
				
				if (!foundGroup) {
					rowStr += "█";
				}
			}
		}
		console.log(rowStr);
	}

	console.log(`     0 |${"─".repeat(chartWidth)}`);

	if (displayBuckets.length > 0) {
		const firstLabel = formatBucketLabel(displayBuckets[0]!.period, binSize);
		const lastLabel = formatBucketLabel(displayBuckets[displayBuckets.length - 1]!.period, binSize);
		const padding = chartWidth - firstLabel.length - lastLabel.length;
		console.log(`        ${firstLabel}${" ".repeat(Math.max(0, padding))}${lastLabel}`);
	}

	console.log("");
	console.log("  Groups:");
	for (let i = 0; i < groupKeys.length && i < 6; i++) {
		const color = GROUP_COLORS[i % GROUP_COLORS.length];
		console.log(`    ${color}█${RESET_COLOR} ${groupKeys[i]}`);
	}
	if (groupKeys.length > 6) {
		console.log(`    ... and ${groupKeys.length - 6} more`);
	}
}

function formatBucketLabel(timestamp: number, binSize: string): string {
	const date = new Date(timestamp);
	switch (binSize) {
		case "hour":
			return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
		case "month":
			return `${date.getMonth() + 1}/${date.getFullYear()}`;
		default:
			return `${date.getMonth() + 1}/${date.getDate()}`;
	}
}

function normalizeTimestamp(timestamp: number): number {
	return timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
}

function formatDateTime(timestamp: number): string {
	const ms = normalizeTimestamp(timestamp);
	return new Date(ms).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - 3) + "...";
}
