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

const legacyCreateReward = (name: string) => ({
	name,
	id: "summer",
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
});
