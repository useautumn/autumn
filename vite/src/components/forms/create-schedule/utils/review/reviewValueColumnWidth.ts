import type {
	SetPlansReviewSection,
	SetPlansReviewValue,
} from "@autumn/shared";
import { REVIEW_VALUE_COLUMN_MIN_WIDTH_PX } from "../../components/review/reviewColumns";

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
	return `max(${REVIEW_VALUE_COLUMN_MIN_WIDTH_PX}px, ${longestValue}ch)`;
};
