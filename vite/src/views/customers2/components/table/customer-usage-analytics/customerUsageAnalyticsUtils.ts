import type { Event } from "@autumn/shared";
import type { ChartConfig } from "@autumn/ui";

type TimeseriesMeta = {
	name: string;
	type?: string;
};

type TimeseriesRow = Record<string, string | number>;

export type TimeseriesData = {
	meta: TimeseriesMeta[];
	rows: number;
	data: TimeseriesRow[];
};

export function prepareTimeseriesChartData({
	timeseriesEvents,
}: {
	timeseriesEvents: TimeseriesData;
}): {
	chartData: Record<string, string | number>[];
	chartConfig: ChartConfig;
	eventNames: string[];
	maxValue: number;
} {
	const eventNames = timeseriesEvents.meta
		.filter((m) => m.name !== "period")
		.map((m) => m.name.replace("_count", ""));

	const config: ChartConfig = {};
	eventNames.forEach((name: string, index: number) => {
		config[name] = {
			label: name,
			color: `var(--chart-${(index % 5) + 1})`,
		};
	});

	const chartData = timeseriesEvents.data.map((row) => {
		const periodStr = String(row.period);
		const [year, month, day] = periodStr.slice(0, 10).split("-").map(Number);
		const date = new Date(year, month - 1, day);
		const dayKey = date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});

		const dataPoint: Record<string, string | number> = { date: dayKey };

		eventNames.forEach((eventName: string) => {
			const countKey = `${eventName}_count`;
			dataPoint[eventName] = row[countKey] || 0;
		});

		return dataPoint;
	});

	const max = Math.max(
		...chartData.map((day) =>
			eventNames.reduce((sum, eventName) => {
				const value = (day as Record<string, number | string>)[eventName];
				return sum + (typeof value === "number" ? value : 0);
			}, 0),
		),
		0,
	);

	return {
		chartData,
		chartConfig: config,
		eventNames,
		maxValue: max,
	};
}

function getAvailableFeatures({ events }: { events: Event[] }): string[] {
	if (!events || events.length === 0) return [];
	return Array.from(new Set(events.map((e) => e.event_name)));
}

function filterEventsByTimeAndFeatures({
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

	for (let i = daysToShow; i >= 0; i--) {
		const date = new Date();
		date.setDate(date.getDate() - i);
		const dayKey = date.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
		allDates[dayKey] = {};
	}

	const data = Object.entries(allDates).map(([day, counts]) => ({
		date: day,
		default: 0,
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
