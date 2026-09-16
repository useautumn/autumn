import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import { creditRateSummary } from "./creditRateSummary";

const flat: CreditSchemaItem = {
	metered_feature_id: "tokens",
	feature_amount: 1,
	credit_amount: 2,
};

const summarize = (item: CreditSchemaItem) =>
	creditRateSummary({ item, unitName: "token", isAiChild: false });

test("a plain row summarises its rate only", () => {
	expect(summarize(flat)).toBe("2 credits");
});

test("a row with dimension rules appends how many it has", () => {
	expect(
		summarize({
			...flat,
			dimensions: {
				size_large: { match: { size: "large" }, credit_amount: 16 },
				size_xl: { match: { size: "xl" }, credit_amount: 20 },
			},
		}),
	).toBe("2 credits · 2 dimensions");
});

test("a single dimension is singular", () => {
	expect(
		summarize({
			...flat,
			dimensions: {
				size_large: { match: { size: "large" }, credit_amount: 16 },
			},
		}),
	).toBe("2 credits · 1 dimension");
});

test("billing units above one keep the per-unit wording", () => {
	expect(summarize({ ...flat, feature_amount: 1_000 })).toBe(
		"2 credits per 1000 token",
	);
});
