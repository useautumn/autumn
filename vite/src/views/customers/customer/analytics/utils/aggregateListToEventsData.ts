import type { EventAggregateListItemV1 } from "@autumn/shared";
import type { EventRow, EventsData } from "../components/analytics-types";
import { epochToPeriodString } from "./epochToPeriodString";

const toSeriesColumn = (featureId: string) => `${featureId}_count`;

/**
 * Lays an events.aggregate `list` out as the row shape the chart pipeline
 * reads: one row per period, or per period and group value when grouped.
 */
export const aggregateListToEventsData = ({
	list,
	featureIds,
	groupColumn,
	utc,
}: {
	list: EventAggregateListItemV1[];
	featureIds: string[];
	/** Row column holding the group value, e.g. "customer_id" or "properties.region". */
	groupColumn?: string;
	utc: boolean;
}): EventsData => {
	const seriesColumns = featureIds.map(toSeriesColumn);
	const data: EventRow[] = [];

	for (const item of list) {
		const period = epochToPeriodString({ epochMs: item.period, utc });

		if (!groupColumn) {
			const row: EventRow = { period };
			for (const featureId of featureIds) {
				row[toSeriesColumn(featureId)] = item.values[featureId] ?? 0;
			}
			data.push(row);
			continue;
		}

		const groupedValues = item.grouped_values ?? {};
		const groupValues = new Set(
			Object.values(groupedValues).flatMap((byGroup) => Object.keys(byGroup)),
		);
		for (const groupValue of groupValues) {
			const row: EventRow = { period, [groupColumn]: groupValue };
			for (const featureId of featureIds) {
				row[toSeriesColumn(featureId)] =
					groupedValues[featureId]?.[groupValue] ?? 0;
			}
			data.push(row);
		}
	}

	const meta = [
		{ name: "period" },
		...(groupColumn ? [{ name: groupColumn }] : []),
		...seriesColumns.map((name) => ({ name })),
	];

	return { meta, rows: data.length, data };
};
