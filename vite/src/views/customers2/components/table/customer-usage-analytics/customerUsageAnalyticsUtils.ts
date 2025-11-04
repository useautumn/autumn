import type { Event } from "@autumn/shared";
import type { ChartConfig } from "@/components/ui/chart";

/**
 * Extracts unique event names from events
 */
export function getAvailableFeatures({
	events,
}: {
	events: Event[];
}): string[] {
	if (!events || events.length === 0) return [];
	return Array.from(new Set(events.map((e) => e.event_name)));
}

/**
 * Filters events by time range and selected features
 */
export function filterEventsByTimeAndFeatures({
	events,
	selectedDays,
	selectedFeatures,
}: {
	events: Event[];
	selectedDays: number | null;
	selectedFeatures: string[] | null;
}): Event[] {
	if (!events || !selectedDays) return events ?? [];

	const cutoffDate = new Date();
	cutoffDate.setDate(cutoffDate.getDate() - selectedDays);
	const cutoffTime = cutoffDate.getTime();

	const filtered = events.filter((event) => {
		const eventTime =
			typeof event.timestamp === "number"
				? event.timestamp * 1000
				: new Date(event.timestamp as unknown as string).getTime();

		const withinTimeRange = eventTime >= cutoffTime;
		const matchesFeature = selectedFeatures?.includes(event.event_name);

		return withinTimeRange && matchesFeature;
	});

	return filtered;
}

/**
 * Prepares chart data including config, dates, aggregation, and max value
 */
export function prepareChartData({
	events,
	daysToShow,
}: {
	events: Event[];
	daysToShow: number;
}): {
	chartData: Record<string, string | number>[];
	chartConfig: ChartConfig;
	eventNames: string[];
	maxValue: number;
} {
	const uniqueEventNames =
		events && events.length > 0
			? Array.from(new Set(events.map((e) => e.event_name)))
			: [];

	const config: ChartConfig = {};
	uniqueEventNames.forEach((name: string, index: number) => {
		config[name] = {
			label: name,
			color: `var(--chart-${(index % 5) + 1})`,
		};
	});

	const allDates: Record<string, Record<string, number>> = {};

	for (let i = daysToShow - 1; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dayKey = date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		allDates[dayKey] = {};
	}

	if (events && events.length > 0) {
		events.forEach((event) => {
			const date =
				typeof event.timestamp === "number"
					? new Date(event.timestamp * 1000)
					: // type is Date but actually comes as a string
						new Date(event.timestamp as unknown as string);

			const dayKey = date.toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
			});

			if (allDates[dayKey] !== undefined) {
				const eventName = event.event_name;
				allDates[dayKey][eventName] = (allDates[dayKey][eventName] || 0) + 1;
			}
		});
	}

	const data = Object.entries(allDates).map(([day, counts]) => ({
		date: day,
		...counts,
	}));

	const max = Math.max(
		...data.map((day) =>
			uniqueEventNames.reduce((sum, eventName) => {
				const value = (day as Record<string, number | string>)[eventName];
				return sum + (typeof value === "number" ? value : 0);
			}, 0),
		),
		0,
	);

	return {
		chartData: data,
		chartConfig: config,
		eventNames: uniqueEventNames,
		maxValue: max,
	};
}
