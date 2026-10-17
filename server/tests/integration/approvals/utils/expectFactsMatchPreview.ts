import { expect } from "bun:test";

type PreviewTotals = {
	total: number;
	next_cycle?: { total: number } | null;
};

/** Facts must never drift from what the preview shows the person. */
export const expectFactsMatchPreview = ({
	facts,
	preview,
}: {
	facts: PreviewTotals;
	preview: PreviewTotals;
}) => {
	expect(facts.total).toBe(preview.total);
	expect(facts.next_cycle?.total ?? null).toBe(
		preview.next_cycle?.total ?? null,
	);
};
