import { describe, expect, test } from "bun:test";
import { CreateRewardParamsSchema } from "./rewardsCreateOpModels.js";
import { UpdateRewardParamsSchema } from "./rewardsOpModels.js";

const grant = {
	feature_id: "credits",
	included: 0,
	expiry: null,
};

describe("feature grant included validation", () => {
	test("accepts zero on create and update", () => {
		expect(
			CreateRewardParamsSchema.safeParse({
				feature_grant: {
					id: "zero-grant",
					name: "Zero Grant",
					grants: [grant],
					promo_codes: [{ code: "ZERO", max_uses: null }],
				},
			}).success,
		).toBe(true);

		expect(
			UpdateRewardParamsSchema.safeParse({
				reward_id: "zero-grant",
				feature_grant: { grants: [grant] },
			}).success,
		).toBe(true);
	});

	test("still rejects negative amounts", () => {
		const negativeGrant = { ...grant, included: -1 };

		expect(
			CreateRewardParamsSchema.safeParse({
				feature_grant: {
					id: "negative-grant",
					name: "Negative Grant",
					grants: [negativeGrant],
					promo_codes: [{ code: "NEGATIVE", max_uses: null }],
				},
			}).success,
		).toBe(false);

		expect(
			UpdateRewardParamsSchema.safeParse({
				reward_id: "negative-grant",
				feature_grant: { grants: [negativeGrant] },
			}).success,
		).toBe(false);
	});
});
