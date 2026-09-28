import type {
	CustomerDisplayInfo,
	EntityDisplayInfo,
	Feature,
} from "@autumn/shared";
import { FeatureType } from "@autumn/shared";
import type { EventRow, EventsData } from "../components/analytics-types";
import { CUSTOMER_BALANCE_SUFFIX } from "./deductionsToEventsData";
import {
	entityDisplayLabel,
	groupValueLabel,
	RESERVED_GROUP,
} from "./displayLabels";
import { isOtherSeries, OTHER_SERIES_COLOR } from "./seriesColors";

/**
 * Chart series configuration
 */
export interface ChartSeriesConfig {
	xKey: string;
	yKey: string;
	type: "bar";
	stacked: boolean;
	yName: string;
	/** Group and feature halves of a grouped series' name, for two-line labels. */
	nameParts?: { group: string; feature: string };
	fill: string;
	/** Set only when grouping by customer, for a real customer id. */
	customerId?: string;
	/** Both set only when grouping by entity and the owning customer resolved. */
	entityId?: string;
	entityCustomerId?: string;
}

/**
 * Gets feature name for a given event/feature key
 */
function getFeatureName({
	key,
	features,
}: {
	key: string;
	features: Feature[];
}): string {
	const eventName = key.replace("_count", "");

	const feature = features.find((f) => {
		if (f.type === FeatureType.Boolean) return false;
		if (f.id === eventName) return true;
		if (f.event_names && f.event_names.length > 0) {
			return f.event_names.includes(eventName);
		}
		return false;
	});

	return feature?.name || eventName;
}

/**
 * Splits a pivoted `feature__groupValue` column name into its parts. Feature
 * ids can themselves contain underscores, so the group value is the segment
 * after the LAST `__` separator. Returns null for names without a separator
 * (e.g. `period` or ungrouped feature columns).
 */
export function parseSeriesKey({
	name,
}: {
	name: string;
}): { featureKey: string; groupValue: string } | null {
	const parts = name.split("__");
	if (parts.length < 2) return null;

	return {
		featureKey: parts.slice(0, -1).join("__"),
		groupValue: parts[parts.length - 1],
	};
}

const sumSeriesColumn = ({
	events,
	column,
}: {
	events: EventsData;
	column: string;
}): number =>
	events.data.reduce((total, row) => total + Number(row[column] ?? 0), 0);

/** The feature's catch-all column a trimmed grouped series folds into. */
const otherColumnFor = ({ column }: { column: string }): string | null => {
	const parsed = parseSeriesKey({ name: column });
	return parsed ? `${parsed.featureKey}__${RESERVED_GROUP}` : null;
};

/**
 * Keeps the top-N series by total volume, folding the rest into their
 * feature's "Other" series so period totals stay intact.
 */
export function trimToTopSeries({
	events,
	maxSeries,
}: {
	events: EventsData;
	maxSeries: number;
}): EventsData {
	const seriesCols = events.meta
		.filter((m) => m.name !== "period")
		.map((m) => m.name);

	// Sorted ascending so the largest series is last → top of stack
	const rankedGroups = seriesCols
		.filter((key) => !isOtherSeries({ key }))
		.map((column) => ({
			column,
			total: sumSeriesColumn({ events, column }),
		}))
		.sort((a, b) => a.total - b.total)
		.map(({ column }) => column);
	const keptGroups = rankedGroups.slice(-maxSeries);
	const droppedGroups = rankedGroups.slice(0, -maxSeries);

	const otherCols = new Set(seriesCols.filter((key) => isOtherSeries({ key })));
	for (const column of droppedGroups) {
		const otherColumn = otherColumnFor({ column });
		if (otherColumn) otherCols.add(otherColumn);
	}

	const data = events.data.map((row) => {
		const slim: EventRow = { period: row.period };
		for (const col of keptGroups) slim[col] = row[col] ?? 0;
		for (const col of otherCols) slim[col] = row[col] ?? 0;
		for (const column of droppedGroups) {
			const otherColumn = otherColumnFor({ column });
			if (!otherColumn) continue;
			slim[otherColumn] =
				Number(slim[otherColumn] ?? 0) + Number(row[column] ?? 0);
		}
		return slim;
	});

	// The catch-all bucket always caps the stack, whatever its volume.
	const orderedCols = [...keptGroups, ...otherCols];
	const meta = [{ name: "period" }, ...orderedCols.map((name) => ({ name }))];

	return { meta, rows: data.length, data };
}

/**
 * Transforms grouped data from backend format to chart-ready format.
 *
 * Backend returns (when group_by is used):
 * [
 *   { period: "2024-01-01", "properties.platform": "ios", messages_count: 5 },
 *   { period: "2024-01-01", "properties.platform": "android", messages_count: 3 },
 * ]
 *
 * Chart needs:
 * [
 *   { period: "2024-01-01", "messages_count__ios": 5, "messages_count__android": 3 },
 * ]
 */
export function transformGroupedData({
	events,
	groupBy,
}: {
	events: EventsData;
	groupBy: string | null;
}): EventsData {
	if (!groupBy) {
		return events;
	}

	// Handle special case for column-based operators (not a property)
	const groupByColumn =
		groupBy === "customer_id" ||
		groupBy === "entity_id" ||
		groupBy === "plan_id"
			? groupBy
			: `properties.${groupBy}`;

	// Check if data has the group_by column
	const hasGroupColumn = events.meta.some((m) => m.name === groupByColumn);
	if (!hasGroupColumn) {
		return events;
	}

	// Get feature columns (exclude period and group_by column)
	const featureColumns = events.meta
		.filter((m) => m.name !== "period" && m.name !== groupByColumn)
		.map((m) => m.name);

	// For plan_id, an empty-string group value is meaningful ("no plan") and
	// must be preserved as its own series. For property-based grouping, empty
	// means the property is absent, which we drop.
	const allowEmpty = groupBy === "plan_id";

	// Collect all unique group values
	const groupValues = new Set<string>();
	for (const row of events.data) {
		const groupValue = row[groupByColumn];
		if (groupValue === undefined || groupValue === null) continue;
		if (groupValue === "" && !allowEmpty) continue;
		groupValues.add(String(groupValue));
	}

	// Pivot data: group by period and create columns for each group value
	const pivotedMap = new Map<
		string | number,
		Record<string, string | number>
	>();

	for (const row of events.data) {
		const period = row.period;
		const rawGroupValue = row[groupByColumn];
		const groupValue =
			rawGroupValue === undefined || rawGroupValue === null
				? "unknown"
				: allowEmpty
					? String(rawGroupValue)
					: String(rawGroupValue || "unknown");

		if (!pivotedMap.has(period)) {
			pivotedMap.set(period, { period });
		}

		const pivotedRow = pivotedMap.get(period)!;

		// Add each feature value with the group suffix
		for (const featureCol of featureColumns) {
			const newKey = `${featureCol}__${groupValue}`;
			pivotedRow[newKey] = row[featureCol] ?? 0;
		}
	}

	// Ensure all group combinations exist (fill with 0)
	for (const pivotedRow of pivotedMap.values()) {
		for (const featureCol of featureColumns) {
			for (const groupValue of groupValues) {
				const key = `${featureCol}__${groupValue}`;
				if (pivotedRow[key] === undefined) {
					pivotedRow[key] = 0;
				}
			}
		}
	}

	// Build new meta
	const newMeta: Array<{ name: string }> = [{ name: "period" }];
	for (const featureCol of featureColumns) {
		for (const groupValue of groupValues) {
			newMeta.push({ name: `${featureCol}__${groupValue}` });
		}
	}

	return {
		meta: newMeta,
		rows: pivotedMap.size,
		data: Array.from(pivotedMap.values()),
	};
}

/**
 * Generates chart configuration. Colors come from `seriesColors`, keyed by
 * series, so hiding one series never repaints the rest.
 */
export function generateChartConfig({
	events,
	features,
	groupBy,
	seriesColors,
	entityNames,
	customerNames,
	planNames,
}: {
	events: EventsData;
	features: Feature[];
	groupBy: string | null;
	seriesColors: Record<string, string>;
	entityNames?: Record<string, EntityDisplayInfo>;
	customerNames?: Record<string, CustomerDisplayInfo>;
	planNames?: Record<string, string>;
}): ChartSeriesConfig[] {
	const colorFor = (key: string) => seriesColors[key] ?? OTHER_SERIES_COLOR;

	if (!groupBy) {
		return events.meta
			.filter((m) => m.name !== "period")
			.map((m) => ({
				xKey: "period",
				yKey: m.name,
				type: "bar" as const,
				stacked: true,
				yName: getFeatureName({ key: m.name, features }),
				fill: colorFor(m.name),
			}));
	}

	// Grouped: create series for each feature__group combination
	const config: ChartSeriesConfig[] = [];

	for (const meta of events.meta) {
		if (meta.name === "period") continue;

		// Parse feature__groupValue format
		const parsed = parseSeriesKey({ name: meta.name });
		if (!parsed) continue;

		const { featureKey, groupValue } = parsed;

		const featureName = getFeatureName({ key: featureKey, features });
		// Spillover series are the base entity's, tagged with a display suffix.
		const isSpilloverSeries =
			groupBy === "entity_id" && groupValue.endsWith(CUSTOMER_BALANCE_SUFFIX);
		const baseEntityId = isSpilloverSeries
			? groupValue.slice(0, -CUSTOMER_BALANCE_SUFFIX.length)
			: groupValue;

		let displayGroupValue: string;
		if (isSpilloverSeries) {
			displayGroupValue = `${entityDisplayLabel({
				entityId: baseEntityId,
				entityNames,
			})}${CUSTOMER_BALANCE_SUFFIX}`;
		} else {
			displayGroupValue = groupValueLabel({
				groupValue,
				groupBy,
				entityNames,
				customerNames,
				planNames,
				features,
			});
		}

		const isRealCustomerGroup =
			groupBy === "customer_id" &&
			groupValue !== "" &&
			groupValue !== RESERVED_GROUP;

		const isRealEntityGroup =
			groupBy === "entity_id" &&
			baseEntityId !== "" &&
			baseEntityId !== RESERVED_GROUP;
		const entityCustomerId = isRealEntityGroup
			? (entityNames?.[baseEntityId]?.internal_customer_id ?? undefined)
			: undefined;

		config.push({
			xKey: "period",
			yKey: meta.name,
			type: "bar",
			stacked: true,
			// A balance deducted by its own feature would otherwise read "Emails (Emails)".
			yName:
				featureName === displayGroupValue
					? featureName
					: `${featureName} (${displayGroupValue})`,
			nameParts:
				featureName === displayGroupValue
					? undefined
					: { group: displayGroupValue, feature: featureName },
			fill: colorFor(meta.name),
			customerId: isRealCustomerGroup ? groupValue : undefined,
			entityId: entityCustomerId ? baseEntityId : undefined,
			entityCustomerId,
		});
	}

	return config;
}
