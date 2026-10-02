import { expect, test } from "bun:test";
import { reviewValueColumnWidth } from "@/components/forms/create-schedule/utils/review/reviewValueColumnWidth";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
} from "@/components/forms/create-schedule/utils/review/types/reviewChange";

const row = (
	key: string,
	amount: string,
	suffix?: string,
): ReviewChangeRow => ({
	key,
	title: key,
	value: { amount, suffix },
});

const section = (rows: ReviewChangeRow[][]): ReviewChangeSection => ({
	summary: "",
	phases: rows.map((phaseRows, index) => ({
		key: `phase-${index}`,
		label: `Phase ${index}`,
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

test("nested item values count toward the width", () => {
	expect(
		reviewValueColumnWidth(
			section([
				[
					{
						...row("plan", "$20", "/mo"),
						items: [row("item", "$1,250.00", "per 1,000 credits")],
					},
				],
			]),
		),
	).toBe("max(104px, 27ch)");
});
