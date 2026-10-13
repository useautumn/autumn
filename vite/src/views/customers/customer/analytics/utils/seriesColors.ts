import type { EventsData } from "../components/analytics-types";
import { RESERVED_GROUP } from "./displayLabels";

/** Categorical hues from the Paper "Chart palette"; themed in @autumn/ui styles. */
const SERIES_HUES = [
	"var(--chart-series-1)",
	"var(--chart-series-2)",
	"var(--chart-series-3)",
	"var(--chart-series-4)",
	"var(--chart-series-5)",
	"var(--chart-series-6)",
	"var(--chart-series-7)",
	"var(--chart-series-8)",
];

/** Each hue in three shades: as-is, eased toward the page, then toward the text. Reads in both themes. */
const SHADES = [
	(hue: string) => hue,
	(hue: string) => `color-mix(in oklch, ${hue} 60%, var(--background))`,
	(hue: string) => `color-mix(in oklch, ${hue} 70%, var(--foreground))`,
];

/** Every chart colour, base hues first; nothing in the chart is ever grey. */
const SERIES_PALETTE = SHADES.flatMap((shade) => SERIES_HUES.map(shade));

const SERIES_COLUMN_SUFFIX = "_count";

/** True for the catch-all bucket the pipe folds groups beyond the top N into. */
export function isOtherSeries({ key }: { key: string }): boolean {
	return key.endsWith(`__${RESERVED_GROUP}`);
}

/** An event's own colour, by its place in the selection, so it holds across ranges and refetches. */
export function eventColor({ eventIndex }: { eventIndex: number }): string {
	return SERIES_PALETTE[eventIndex % SERIES_PALETTE.length];
}

const hashString = (value: string) => {
	let hash = 2166136261;
	for (const char of value)
		hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return hash >>> 0;
};

/** A slot per value from its hash, probing past taken ones, so a value keeps its slot as the set around it changes. */
const stableSlots = ({
	values,
	slotCount,
}: {
	values: string[];
	slotCount: number;
}): Map<string, number> => {
	const slots = new Map<string, number>();
	const taken = new Set<number>();
	for (const value of [...values].sort()) {
		let slot = hashString(value) % slotCount;
		for (let tries = 0; taken.has(slot) && tries < slotCount; tries++) {
			slot = (slot + 1) % slotCount;
		}
		taken.add(slot);
		slots.set(value, slot);
	}
	return slots;
};

const splitSeriesKey = (key: string) => {
	const separator = key.lastIndexOf("__");
	const featureColumn = separator === -1 ? key : key.slice(0, separator);
	return {
		eventName: featureColumn.replace(SERIES_COLUMN_SUFFIX, ""),
		groupValue: separator === -1 ? null : key.slice(separator + 2),
	};
};

/**
 * One colour per chart series. Ungrouped series take their event's colour; grouped series take
 * their group's hue (the "Other values" bucket included), shaded per event when several are stacked.
 */
export function assignSeriesColors({
	events,
	eventNames,
}: {
	events: EventsData;
	eventNames: string[];
}): Record<string, string> {
	const series = events.meta
		.filter(({ name }) => name !== "period")
		.map(({ name }) => ({ key: name, ...splitSeriesKey(name) }));

	// Selected events keep their selection order; anything else queues after them.
	const eventIndex = new Map(eventNames.map((name, index) => [name, index]));
	for (const { eventName } of series) {
		if (!eventIndex.has(eventName)) eventIndex.set(eventName, eventIndex.size);
	}
	const eventIndexOf = (name: string) => eventIndex.get(name) ?? 0;

	const groups = [
		...new Set(
			series.flatMap((s) => (s.groupValue === null ? [] : [s.groupValue])),
		),
	];
	if (groups.length === 0) {
		return Object.fromEntries(
			series.map((s) => [
				s.key,
				eventColor({ eventIndex: eventIndexOf(s.eventName) }),
			]),
		);
	}

	const stackedEvents = new Set(series.map((s) => s.eventName)).size;
	const slotCount =
		stackedEvents > 1 ? SERIES_HUES.length : SERIES_PALETTE.length;
	const groupSlots = stableSlots({ values: groups, slotCount });

	return Object.fromEntries(
		series.map((s) => {
			const slot = groupSlots.get(s.groupValue ?? "") ?? 0;
			const color =
				stackedEvents > 1
					? SHADES[eventIndexOf(s.eventName) % SHADES.length](SERIES_HUES[slot])
					: SERIES_PALETTE[slot];
			return [s.key, color];
		}),
	);
}
