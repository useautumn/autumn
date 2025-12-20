import { UTCDate } from "@date-fns/utc";

/**
 * Convert event periods from ISO strings to epoch timestamps.
 * @param events - The events to convert.
 * @returns The current time as an epoch timestamp for filtering.
 */
export function convertPeriodsToEpoch(
	events: Array<Record<string, string | number>>,
): number {
	const currentTime = new UTCDate().getTime();
	for (const event of events) {
		event.period = new UTCDate(event.period as string).getTime();
	}
	return currentTime;
}

/**
 * Normalize a group value to a string.
 * @param value - The value to normalize.
 * @returns The normalized value as a string or null if the value is null or empty.
 */
function normalizeGroupValue(value: unknown): string | null {
	if (value == null || value === "") return null;
	return String(value);
}

/**
 * Collect grouping metadata from a list of rows.
 * @param rows - The rows to collect metadata from.
 * @param groupByField - The field to group by.
 * @returns The group values and feature names.
 */
export function collectGroupingMetadata(
	rows: Array<Record<string, string | number>>,
	groupByField: string,
): { groupValues: Set<string>; featureNames: Set<string> } {
	const groupValues = new Set<string>();
	const featureNames = new Set<string>();

	for (const row of rows) {
		// biome-ignore lint/correctness/noUnusedVariables: period is required here but appears unused
		const { [groupByField]: groupValue, period, ...metrics } = row;
		const normalized = normalizeGroupValue(groupValue);
		if (normalized) {
			groupValues.add(normalized);
		}
		for (const featureName of Object.keys(metrics)) {
			featureNames.add(featureName);
		}
	}

	return { groupValues, featureNames };
}

/**
 * Build a grouped timeseries from a list of rows.
 * @param rows - The rows to build the grouped timeseries from.
 * @param groupByField - The field to group by.
 * @returns The grouped timeseries.
 */
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

		const normalized = normalizeGroupValue(groupValue);
		if (!normalized) continue;

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

/**
 * Backfill missing group values in a grouped timeseries.
 * @param grouped - The grouped timeseries to backfill.
 * @param groupValues - The group values to backfill.
 * @param featureNames - The feature names to backfill.
 */
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
