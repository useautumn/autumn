import { describe, expect, test } from "bun:test";
import { ApiCreditDimensionSchema } from "@autumn/shared";

const dimension = ({ tierBehavior }: { tierBehavior: string }) => ({
	match: { model: "gpt" },
	tier_behavior: tierBehavior,
	tiers: [
		{ to: 100, credit_cost: 2 },
		{ to: "inf", credit_cost: 1 },
	],
});

describe("credit rate card tiers", () => {
	test("accept graduated tiers", () => {
		expect(
			ApiCreditDimensionSchema.safeParse(
				dimension({ tierBehavior: "graduated" }),
			).success,
		).toBe(true);
	});

	test("reject volume tiers, which credit rates don't support", () => {
		expect(
			ApiCreditDimensionSchema.safeParse(dimension({ tierBehavior: "volume" }))
				.success,
		).toBe(false);
	});
});
