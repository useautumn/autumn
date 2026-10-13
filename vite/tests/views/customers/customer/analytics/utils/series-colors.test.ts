import { expect, test } from "bun:test";
import type { EventsData } from "@/views/customers/customer/analytics/components/analytics-types";
import { RESERVED_GROUP } from "@/views/customers/customer/analytics/utils/displayLabels";
import {
	assignSeriesColors,
	eventColor,
} from "@/views/customers/customer/analytics/utils/seriesColors";

const eventsFor = (columns: Record<string, number>): EventsData => ({
	meta: [{ name: "period" }, ...Object.keys(columns).map((name) => ({ name }))],
	rows: 1,
	data: [{ period: "2026-08-20 00:00:00", ...columns }],
});

const groupedColumns = ({
	events,
	groups,
}: {
	events: string[];
	groups: string[];
}) =>
	Object.fromEntries(
		events.flatMap((event, eventIndex) =>
			groups.map((group, groupIndex) => [
				`${event}_count__${group}`,
				(eventIndex + 1) * (groupIndex + 1),
			]),
		),
	);

const isPaletteColor = (color: string) =>
	color.startsWith("var(--chart-series-") ||
	(color.startsWith("color-mix(") && color.includes("var(--chart-series-"));

test("colours ungrouped events by their place in the selection, not their volume", () => {
	const colors = assignSeriesColors({
		events: eventsFor({ api_calls_count: 1, messages_count: 500 }),
		eventNames: ["api_calls", "messages"],
	});

	expect(colors).toEqual({
		api_calls_count: eventColor({ eventIndex: 0 }),
		messages_count: eventColor({ eventIndex: 1 }),
	});
});

test("gives every grouped series a palette colour, Other values included", () => {
	const groups = [
		...Array.from({ length: 25 }, (_, index) => `key_${index}`),
		RESERVED_GROUP,
	];
	const events = ["api_calls", "messages", "tokens"];
	const colors = assignSeriesColors({
		events: eventsFor(groupedColumns({ events, groups })),
		eventNames: events,
	});

	expect(Object.keys(colors)).toHaveLength(events.length * groups.length);
	for (const color of Object.values(colors)) {
		expect(isPaletteColor(color)).toBe(true);
	}
});

test("keeps a group's colour when volumes and column order change", () => {
	const groups = ["key_a", "key_b", "key_c", RESERVED_GROUP];
	const first = assignSeriesColors({
		events: eventsFor(groupedColumns({ events: ["messages"], groups })),
		eventNames: ["messages"],
	});
	const refetched = assignSeriesColors({
		events: eventsFor(
			Object.fromEntries(
				Object.keys(first)
					.reverse()
					.map((key, index) => [key, 1000 - index]),
			),
		),
		eventNames: ["messages"],
	});

	expect(refetched).toEqual(first);
});

test("gives distinct groups distinct colours while the palette has room", () => {
	const groups = Array.from({ length: 12 }, (_, index) => `key_${index}`);
	const colors = assignSeriesColors({
		events: eventsFor(groupedColumns({ events: ["messages"], groups })),
		eventNames: ["messages"],
	});

	expect(new Set(Object.values(colors)).size).toBe(groups.length);
});

test("shades a group's hue per event when several events stack", () => {
	const colors = assignSeriesColors({
		events: eventsFor(
			groupedColumns({ events: ["api_calls", "messages"], groups: ["key_a"] }),
		),
		eventNames: ["api_calls", "messages"],
	});

	const apiCalls = colors.api_calls_count__key_a;
	const messages = colors.messages_count__key_a;
	expect(apiCalls).not.toBe(messages);
	expect(messages).toContain(apiCalls);
});
