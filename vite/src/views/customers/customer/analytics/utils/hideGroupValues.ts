import type { EventRow, EventsData } from "../components/analytics-types";
import { CUSTOMER_BALANCE_SUFFIX } from "./deductionsToEventsData";
import { groupByToColumn } from "./groupByColumn";
import { parseSeriesKey } from "./transformGroupedChartData";

/** Drops the raw rows whose group value the viewer unticked. */
export const hideGroupRows = ({
	events,
	groupBy,
	hiddenGroupValues,
}: {
	events: EventsData;
	groupBy: string;
	hiddenGroupValues: Set<string>;
}): EventsData => {
	const column = groupByToColumn({ groupBy });
	const data = events.data.filter(
		(row: EventRow) => !hiddenGroupValues.has(String(row[column] ?? "")),
	);
	return { ...events, data, rows: data.length };
};

const baseGroupValue = ({ groupValue }: { groupValue: string }) =>
	groupValue.endsWith(CUSTOMER_BALANCE_SUFFIX)
		? groupValue.slice(0, -CUSTOMER_BALANCE_SUFFIX.length)
		: groupValue;

/** The distinct groups in pre-pivoted deduction series, spillover folded in. */
export const deductionGroupValues = ({
	events,
}: {
	events: EventsData | null;
}): string[] => {
	const values = new Set<string>();
	for (const { name } of events?.meta ?? []) {
		const groupValue = parseSeriesKey({ name })?.groupValue;
		if (groupValue !== undefined) values.add(baseGroupValue({ groupValue }));
	}
	return Array.from(values).sort();
};

/** Deduction rows arrive pre-pivoted into `feature__group` columns, so hiding a
 * group drops its columns rather than rows. */
export const hideGroupSeries = ({
	events,
	hiddenGroupValues,
}: {
	events: EventsData;
	hiddenGroupValues: Set<string>;
}): EventsData => {
	const meta = events.meta.filter(({ name }) => {
		if (name === "period") return true;
		const groupValue = parseSeriesKey({ name })?.groupValue;
		if (groupValue === undefined) return false;
		// An entity's spillover series belongs to that entity.
		return !hiddenGroupValues.has(baseGroupValue({ groupValue }));
	});
	const columns = meta.map(({ name }) => name);
	const data = events.data.map((row: EventRow) => {
		const slim: EventRow = {};
		for (const column of columns) slim[column] = row[column];
		return slim;
	});
	return { ...events, meta, data };
};
