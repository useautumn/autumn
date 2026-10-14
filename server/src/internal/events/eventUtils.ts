import { TZDate } from "@date-fns/tz";
import { UTCDate } from "@date-fns/utc";

export const periodToEpoch = ({
	period,
	timezone,
	binSize,
}: {
	period: string;
	timezone?: string;
	binSize?: string;
}): number => {
	if (!timezone || timezone === "UTC" || binSize === "hour") {
		return new UTCDate(period).getTime();
	}

	const [datePart, timePart = "00:00:00"] = period.split(" ");
	const [year, month, day] = datePart.split("-").map(Number);
	const [hours, minutes, seconds] = timePart.split(":").map(Number);
	return new TZDate(
		year,
		month - 1,
		day,
		hours,
		minutes,
		seconds,
		timezone,
	).getTime();
};

export function convertPeriodsToEpoch({
	events,
	timezone,
	binSize,
}: {
	events: Array<Record<string, string | number>>;
	timezone?: string;
	binSize?: string;
}): void {
	for (const event of events) {
		event.period = periodToEpoch({
			period: event.period as string,
			timezone,
			binSize,
		});
	}
}

function normalizeGroupValue(
	value: unknown,
	groupByField?: string,
): string | null {
	if (value == null) return null;
	if (value === "" && groupByField !== "plan_id") return null;
	return String(value);
}

export function collectGroupingMetadata(
	rows: Array<Record<string, string | number>>,
	groupByField: string,
): { groupValues: Set<string>; featureNames: Set<string> } {
	const groupValues = new Set<string>();
	const featureNames = new Set<string>();

	for (const row of rows) {
		// biome-ignore lint/correctness/noUnusedVariables: period is required here but appears unused
		const { [groupByField]: groupValue, period, ...metrics } = row;
		const normalized = normalizeGroupValue(groupValue, groupByField);
		if (normalized !== null) {
			groupValues.add(normalized);
		}
		for (const featureName of Object.keys(metrics)) {
			featureNames.add(featureName);
		}
	}

	return { groupValues, featureNames };
}

export function buildGroupedTimeseries(
	rows: Array<Record<string, string | number>>,
	groupByField: string,
): Map<number, Record<string, number | Record<string, number>>> {
	const grouped = new Map<
		number,
		Record<string, number | Record<string, number>>
	>();

	for (const row of rows) {
		const { period, [groupByField]: groupValue, ...metrics } = row;
		const periodNum = Number(period);

		if (!grouped.has(periodNum)) {
			grouped.set(periodNum, { period: periodNum });
		}

		const normalized = normalizeGroupValue(groupValue, groupByField);
		if (normalized === null) continue;

		const periodData = grouped.get(periodNum)!;
		for (const [featureName, value] of Object.entries(metrics)) {
			if (!periodData[featureName]) {
				periodData[featureName] = {};
			}
			(periodData[featureName] as Record<string, number>)[normalized] =
				Number(value);
		}
	}

	return grouped;
}

export function backfillMissingGroupValues(
	grouped: Map<number, Record<string, number | Record<string, number>>>,
	groupValues: Set<string>,
	featureNames: Set<string>,
): void {
	for (const periodData of grouped.values()) {
		for (const featureName of featureNames) {
			if (!periodData[featureName]) {
				periodData[featureName] = {};
			}
			const featureData = periodData[featureName] as Record<string, number>;
			for (const groupValue of groupValues) {
				if (featureData[groupValue] === undefined) {
					featureData[groupValue] = 0;
				}
			}
		}
	}
}
