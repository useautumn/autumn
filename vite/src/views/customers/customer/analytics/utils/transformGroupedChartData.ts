import type { Feature } from "@autumn/shared";
import { FeatureType } from "@autumn/shared";

/**
 * Row data from the events API
 */
type EventRow = Record<string, string | number>;

/**
 * Events data structure from the API
 */
interface EventsData {
	meta: Array<{ name: string }>;
	rows: number;
	data: EventRow[];
}

/**
 * Ensures events data has a meta property by building it from the first data row if missing
 */
function ensureMeta(events: EventsData): EventsData {
	if (events.meta && events.meta.length > 0) {
		return events;
	}

	if (!events.data || events.data.length === 0) {
		return { ...events, meta: [], rows: 0 };
	}

	return {
		...events,
		meta: Object.keys(events.data[0]).map((key) => ({ name: key })),
		rows: events.rows ?? events.data.length,
	};
}

/**
 * Chart series configuration
 */
interface ChartSeriesConfig {
	xKey: string;
	yKey: string;
	type: "bar";
	stacked: boolean;
	yName: string;
	fill: string;
}

/**
 * Chart colors palette - more distinct colors for groups
 */
const CHART_COLORS = [
	"#9c5aff", // purple
	"#27a7ff", // blue
	"#10b981", // green
	"#f59e0b", // orange
	"#ef4444", // red
	"#ec4899", // pink
	"#06b6d4", // cyan
	"#8b5cf6", // violet
	"#14b8a6", // teal
	"#f97316", // orange-dark
];

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
	// Ensure meta exists
	events = ensureMeta(events);

	if (!groupBy) {
		return events;
	}

	const groupByColumn = `properties.${groupBy}`;

	// Check if data has the group_by column
	const hasGroupColumn = events.meta.some((m) => m.name === groupByColumn);
	if (!hasGroupColumn) {
		return events;
	}

	// Get feature columns (exclude period and group_by column)
	const featureColumns = events.meta
		.filter((m) => m.name !== "period" && m.name !== groupByColumn)
		.map((m) => m.name);

	// Collect all unique group values
	const groupValues = new Set<string>();
	for (const row of events.data) {
		const groupValue = row[groupByColumn];
		if (groupValue !== undefined && groupValue !== null && groupValue !== "") {
			groupValues.add(String(groupValue));
		}
	}

	// Pivot data: group by period and create columns for each group value
	const pivotedMap = new Map<
		string | number,
		Record<string, string | number>
	>();

	for (const row of events.data) {
		const period = row.period;
		const groupValue = String(row[groupByColumn] || "unknown");

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
 * Generates chart configuration with different colors per group.
 */
export function generateChartConfig({
	events,
	features,
	groupBy,
	originalColors,
}: {
	events: EventsData;
	features: Feature[];
	groupBy: string | null;
	originalColors: string[];
}): ChartSeriesConfig[] {
	// Ensure meta exists
	events = ensureMeta(events);

	const colorsToUse = groupBy ? CHART_COLORS : originalColors;

	if (!groupBy) {
		// Non-grouped: original behavior
		return events.meta
			.filter((m) => m.name !== "period")
			.map((m, index) => ({
				xKey: "period",
				yKey: m.name,
				type: "bar" as const,
				stacked: true,
				yName: getFeatureName({ key: m.name, features }),
				fill: colorsToUse[index % colorsToUse.length],
			}));
	}

	// Grouped: create series for each feature__group combination
	const config: ChartSeriesConfig[] = [];
	let colorIndex = 0;

	for (const meta of events.meta) {
		if (meta.name === "period") continue;

		// Parse feature__groupValue format
		const parts = meta.name.split("__");
		if (parts.length < 2) continue;

		const featureKey = parts.slice(0, -1).join("__"); // Handle feature names with underscores
		const groupValue = parts[parts.length - 1];

		const featureName = getFeatureName({ key: featureKey, features });

		config.push({
			xKey: "period",
			yKey: meta.name,
			type: "bar",
			stacked: true,
			yName: `${featureName} (${groupValue})`,
			fill: colorsToUse[colorIndex % colorsToUse.length],
		});

		colorIndex++;
	}

	return config;
}
