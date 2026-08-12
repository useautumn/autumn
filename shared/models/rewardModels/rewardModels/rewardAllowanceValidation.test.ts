import { describe, expect, test } from "bun:test";
import { RewardType } from "./rewardEnums.js";
import { CreateRewardSchema } from "./rewardModels.js";

const base = {
	name: "Zero Grant",
	id: "zero-grant",
	type: RewardType.FeatureGrant,
	promo_codes: [{ code: "ZERO" }],
};

const parse = (allowance?: number) =>
	CreateRewardSchema.safeParse({
		...base,
		entitlements: [
			{
				internal_feature_id: "if_credits",
				...(allowance === undefined ? {} : { allowance }),
			},
		],
	}).success;

describe("dashboard reward entitlement allowance", () => {
	test("accepts zero", () => {
		expect(parse(0)).toBe(true);
	});

	test("accepts positive", () => {
		expect(parse(500)).toBe(true);
	});

	test("rejects negative", () => {
		expect(parse(-1)).toBe(false);
	});

	test("accepts omitted for boolean grants", () => {
		expect(parse()).toBe(true);
	});
});
