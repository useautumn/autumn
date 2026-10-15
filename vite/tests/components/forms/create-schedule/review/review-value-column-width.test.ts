import { expect, test } from "bun:test";
import type { SetPlansReviewRow, SetPlansReviewSection } from "@autumn/shared";
import { reviewValueColumnWidth } from "@/components/forms/create-schedule/utils/review/reviewValueColumnWidth";

const row = (
	key: string,
	amount: string,
	suffix?: string,
): SetPlansReviewRow => ({
	key,
	title: key,
	value: { amount, suffix },
});

const section = (rows: SetPlansReviewRow[][]): SetPlansReviewSection => ({
	summary: [],
	phases: rows.map((phaseRows, index) => ({
		key: `phase-${index}`,
		label: [`Phase ${index}`],
		rows: phaseRows,
	})),
});

test("every phase shares the width of the section's longest value", () => {
	expect(
		reviewValueColumnWidth(
			section([
				[row("a", "40,000", "of 40,000 left"), row("b", "0", "of 0 left")],
				[row("c", "140,000", "of 140,000 left")],
			]),
		),
	).toBe("max(104px, 23ch)");
});
