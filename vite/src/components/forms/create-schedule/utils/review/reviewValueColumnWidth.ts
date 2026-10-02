import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeValue,
} from "./types/reviewChange";

const MIN_VALUE_COLUMN_WIDTH_PX = 104;

const valueText = (value: ReviewChangeValue) =>
	value.suffix ? `${value.amount} ${value.suffix}` : value.amount;

const rowsWithItems = (rows: ReviewChangeRow[]): ReviewChangeRow[] =>
	rows.flatMap((row) => [row, ...(row.items ?? [])]);

/** One width for every row's value column in a section, so the status chips beside it line up. */
export const reviewValueColumnWidth = (section: ReviewChangeSection) => {
	const longestValue = Math.max(
		0,
		...section.phases
			.flatMap((phase) => rowsWithItems(phase.rows))
			.map((row) => (row.value ? valueText(row.value).length : 0)),
	);
	return `max(${MIN_VALUE_COLUMN_WIDTH_PX}px, ${longestValue}ch)`;
};
