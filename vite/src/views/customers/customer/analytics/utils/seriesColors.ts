import type { EventsData } from "../components/analytics-types";
import { RESERVED_GROUP } from "./displayLabels";

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

const SHADES = [
	(hue: string) => hue,
	(hue: string) => `color-mix(in oklch, ${hue} 60%, var(--background))`,
	(hue: string) => `color-mix(in oklch, ${hue} 70%, var(--foreground))`,
];

const SERIES_PALETTE = SHADES.flatMap((shade) => SERIES_HUES.map(shade));

const SERIES_COLUMN_SUFFIX = "_count";

export function isOtherSeries({ key }: { key: string }): boolean {
	return key.endsWith(`__${RESERVED_GROUP}`);
}

export function eventColor({ eventIndex }: { eventIndex: number }): string {
	return SERIES_PALETTE[eventIndex % SERIES_PALETTE.length];
}

const hashString = (value: string) => {
	let hash = 2166136261;
	for (const char of value)
		hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return hash >>> 0;
};

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
