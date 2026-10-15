import { expect, test } from "bun:test";
import type { CreditSchemaItem } from "@autumn/shared";
import { creditRateSummary } from "./creditRateSummary";

const flat: CreditSchemaItem = {
	metered_feature_id: "tokens",
	feature_amount: 1,
	credit_amount: 2,
};
const large = { match: { size: "large" }, credit_amount: 16 };
const xl = { match: { size: "xl" }, credit_amount: 20 };
const double = { match: { region: "eu" }, factor: 2 };

test.each<[string, CreditSchemaItem, string]>([
	["a plain row summarises its rate only", flat, "2 credits"],
	[
		"dimension rules say the rate varies",
		{ ...flat, dimensions: { size_large: large, size_xl: xl } },
		"2 credits · varies by event · 2 dimensions",
	],
	[
		"a single dimension is singular",
		{ ...flat, dimensions: { size_large: large } },
		"2 credits · varies by event · 1 dimension",
	],
	[
		"a multiplier alone still says the rate varies",
		{ ...flat, multipliers: { eu: double } },
		"2 credits · varies by event · 1 multiplier",
	],
	[
		"dimensions and multipliers are both counted",
		{ ...flat, dimensions: { size_large: large }, multipliers: { eu: double } },
		"2 credits · varies by event · 1 dimension, 1 multiplier",
	],
	[
		"billing units above one keep the per-unit wording",
		{ ...flat, feature_amount: 1_000 },
		"2 credits per 1000 token",
	],
])("%s", (_, item, expected) => {
	expect(creditRateSummary({ item, unitName: "token", isAiChild: false })).toBe(
		expected,
	);
});
