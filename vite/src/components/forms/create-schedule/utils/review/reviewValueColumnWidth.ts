import type {
	SetPlansReviewSection,
	SetPlansReviewValue,
} from "@autumn/shared";

const MIN_VALUE_COLUMN_WIDTH_PX = 104;

const valueText = (value: SetPlansReviewValue) =>
	value.suffix ? `${value.amount} ${value.suffix}` : value.amount;

/** One width for every row's value column in a section, so the status chips beside it line up. */
export const reviewValueColumnWidth = (section: SetPlansReviewSection) => {
	const longestValue = Math.max(
		0,
		...section.phases
			.flatMap((phase) => phase.rows)
			.map((row) => (row.value ? valueText(row.value).length : 0)),
	);
	return `max(${MIN_VALUE_COLUMN_WIDTH_PX}px, ${longestValue}ch)`;
};
