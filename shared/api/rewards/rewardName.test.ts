import { describe, expect, test } from "bun:test";
import {
	CreateRewardSchema,
	UpdateRewardSchema,
} from "@models/rewardModels/rewardModels/rewardModels.js";
import { CreateRewardParamsSchema } from "./rewardsCreateOpModels.js";
import { UpdateRewardParamsSchema } from "./rewardsOpModels.js";

const fortyCharName = "x".repeat(40);
const fortyOneCharName = "x".repeat(41);

const createCoupon = (name: string) => ({
	coupon: {
		id: "summer",
		name,
		type: "percentage_discount",
		value: 20,
		duration: { type: "forever", length: null },
		plan_ids: null,
		promo_codes: [{ code: "SUMMER20" }],
	},
});

const legacyCreateReward = (name: string, type = "percentage_discount") => ({
	name,
	id: "summer",
	type,
	promo_codes: [],
	discount_config: null,
});

describe("reward name length", () => {
	test("accepts a coupon name of 40 characters, Stripe's coupon name limit", () => {
		expect(
			CreateRewardParamsSchema.safeParse(createCoupon(fortyCharName)).success,
		).toBe(true);
		expect(
			CreateRewardSchema.safeParse(legacyCreateReward(fortyCharName)).success,
		).toBe(true);
	});

	test("rejects a coupon name over 40 characters on create and update", () => {
		const results = [
			CreateRewardParamsSchema.safeParse(createCoupon(fortyOneCharName)),
			UpdateRewardParamsSchema.safeParse({
				reward_id: "summer",
				coupon: { name: fortyOneCharName },
			}),
			CreateRewardSchema.safeParse(legacyCreateReward(fortyOneCharName)),
			UpdateRewardSchema.safeParse({ name: fortyOneCharName }),
		];

		for (const result of results) {
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path.at(-1)).toBe("name");
		}
	});

	test("leaves feature grant names unbounded: they never become a Stripe coupon", () => {
		const featureGrant = {
			name: fortyOneCharName,
			id: "beta",
			type: "feature_grant",
			promo_codes: [{ code: "BETA" }],
			entitlements: [{ internal_feature_id: "fe_messages", allowance: 10 }],
		};
		expect(CreateRewardSchema.safeParse(featureGrant).success).toBe(true);
		expect(
			UpdateRewardSchema.safeParse({
				name: fortyOneCharName,
				type: "feature_grant",
			}).success,
		).toBe(true);
		expect(
			CreateRewardParamsSchema.safeParse({
				feature_grant: {
					id: "beta",
					name: fortyOneCharName,
					grants: [{ feature_id: "messages", included: 10, expiry: null }],
					promo_codes: [{ code: "BETA", max_uses: null }],
				},
			}).success,
		).toBe(true);
	});
});
