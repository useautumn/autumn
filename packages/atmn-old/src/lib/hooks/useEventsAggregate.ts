import { useMemo } from "react";
import type { ApiEventsListItem } from "./useEvents.js";

export interface AggregateDataPoint {
	key: string;
	value: number;
	style?: string;
}

export interface TimeBucket {
	label: string;
	start: number;
	end: number;
	count: number;
	totalValue: number;
}

export interface FeatureAggregate {
	featureId: string;
	count: number;
	totalValue: number;
	avgValue: number;
}

export type TimeGrouping = "hour" | "day" | "week";

function getTimeBucketLabel(timestamp: number, grouping: TimeGrouping): string {
	const date = new Date(timestamp);

	switch (grouping) {
		case "hour":
			return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
		case "day":
			return `${date.getMonth() + 1}/${date.getDate()}`;
		case "week": {
			const weekStart = new Date(date);
			weekStart.setDate(date.getDate() - date.getDay());
			return `W ${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
		}
	}
}

function getTimeBucketKey(timestamp: number, grouping: TimeGrouping): number {
	const date = new Date(timestamp);

	switch (grouping) {
		case "hour":
			date.setMinutes(0, 0, 0);
			return date.getTime();
		case "day":
			date.setHours(0, 0, 0, 0);
			return date.getTime();
		case "week": {
			date.setHours(0, 0, 0, 0);
			date.setDate(date.getDate() - date.getDay());
			return date.getTime();
		}
	}
}

const FEATURE_COLORS = [
	"cyan",
	"green",
	"yellow",
	"magenta",
	"blue",
	"red",
	"white",
];

export function useEventsAggregate(
	events: ApiEventsListItem[],
	timeGrouping: TimeGrouping = "day",
) {
	const byFeature = useMemo((): FeatureAggregate[] => {
		const featureMap = new Map<
			string,
			{ count: number; totalValue: number }
		>();

		for (const event of events) {
			const existing = featureMap.get(event.feature_id) ?? {
				count: 0,
				totalValue: 0,
			};
			featureMap.set(event.feature_id, {
				count: existing.count + 1,
				totalValue: existing.totalValue + event.value,
			});
		}

		return Array.from(featureMap.entries())
			.map(([featureId, data]) => ({
				featureId,
				count: data.count,
				totalValue: data.totalValue,
				avgValue: data.count > 0 ? data.totalValue / data.count : 0,
			}))
			.sort((a, b) => b.count - a.count);
	}, [events]);

	const byTime = useMemo((): TimeBucket[] => {
		const bucketMap = new Map<
			number,
			{ label: string; count: number; totalValue: number }
		>();

		for (const event of events) {
			const bucketKey = getTimeBucketKey(event.timestamp, timeGrouping);
			const label = getTimeBucketLabel(event.timestamp, timeGrouping);
			const existing = bucketMap.get(bucketKey) ?? {
				label,
				count: 0,
				totalValue: 0,
			};
			bucketMap.set(bucketKey, {
				label,
				count: existing.count + 1,
				totalValue: existing.totalValue + event.value,
			});
		}

		return Array.from(bucketMap.entries())
			.map(([start, data]) => ({
				label: data.label,
				start,
				end: start + getBucketDuration(timeGrouping),
				count: data.count,
				totalValue: data.totalValue,
			}))
			.sort((a, b) => a.start - b.start);
	}, [events, timeGrouping]);

	const featureBarData = useMemo((): AggregateDataPoint[] => {
		return byFeature.slice(0, 10).map((f, idx) => ({
			key: f.featureId.length > 12 ? `${f.featureId.slice(0, 10)}..` : f.featureId,
			value: f.count,
			style: FEATURE_COLORS[idx % FEATURE_COLORS.length],
		}));
	}, [byFeature]);

	const timeScatterData = useMemo((): AggregateDataPoint[] => {
		const buckets = byTime.slice(-20);
		return buckets.map((b) => ({
			key: b.label,
			value: b.count,
			style: "cyan",
		}));
	}, [byTime]);

	const summary = useMemo(() => {
		const totalEvents = events.length;
		const totalValue = events.reduce((sum, e) => sum + e.value, 0);
		const uniqueFeatures = new Set(events.map((e) => e.feature_id)).size;
		const uniqueCustomers = new Set(events.map((e) => e.customer_id)).size;

		return {
			totalEvents,
			totalValue,
			uniqueFeatures,
			uniqueCustomers,
			avgValuePerEvent: totalEvents > 0 ? totalValue / totalEvents : 0,
		};
	}, [events]);

	return {
		byFeature,
		byTime,
		featureBarData,
		timeScatterData,
		summary,
	};
}

function getBucketDuration(grouping: TimeGrouping): number {
	switch (grouping) {
		case "hour":
			return 60 * 60 * 1000;
		case "day":
			return 24 * 60 * 60 * 1000;
		case "week":
			return 7 * 24 * 60 * 60 * 1000;
	}
}
