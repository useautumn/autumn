import type { EventsData } from "../components/analytics-types";
import { RESERVED_GROUP } from "./displayLabels";

/** Categorical slots from the Paper "Chart palette"; themed in @autumn/ui styles. */
const SERIES_SLOT_COLORS = [
	"var(--chart-series-1)",
	"var(--chart-series-2)",
	"var(--chart-series-3)",
	"var(--chart-series-4)",
	"var(--chart-series-5)",
	"var(--chart-series-6)",
	"var(--chart-series-7)",
	"var(--chart-series-8)",
];

export const OTHER_SERIES_COLOR = "var(--chart-series-other)";

/** True for the catch-all bucket the pipe folds groups beyond the top N into. */
export function isOtherSeries({ key }: { key: string }): boolean {
	return key.endsWith(`__${RESERVED_GROUP}`);
}

/**
 * Colors series by volume rank, largest first. Slots cycle past the eighth so a
 * named series is never painted the gray reserved for "Other".
 */
export function assignSeriesColors({
	events,
}: {
	events: EventsData;
}): Record<string, string> {
	const totals = new Map<string, number>();
	for (const { name } of events.meta) {
		if (name !== "period") totals.set(name, 0);
	}
	for (const row of events.data) {
		for (const key of totals.keys()) {
			totals.set(key, (totals.get(key) ?? 0) + Number(row[key] ?? 0));
		}
	}

	const rankedKeys = [...totals.entries()]
		.filter(([key]) => !isOtherSeries({ key }))
		.sort((a, b) => b[1] - a[1])
		.map(([key]) => key);

	const colors: Record<string, string> = {};
	for (const [index, key] of rankedKeys.entries()) {
		colors[key] = SERIES_SLOT_COLORS[index % SERIES_SLOT_COLORS.length];
	}
	return colors;
}
