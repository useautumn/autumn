import { describe, expect, test } from "bun:test";
import { CouponDurationType, RewardType } from "./rewardEnums.js";
import { CreateRewardSchema, UpdateRewardSchema } from "./rewardModels.js";

const discountConfig = (discountValue: number) => ({
	discount_value: discountValue,
	duration_type: CouponDurationType.Forever,
	duration_value: 1,
	apply_to_all: true,
});

const createReward = (type: RewardType, discountValue: number) => ({
	id: "reward",
	name: "Reward",
	promo_codes: [],
	type,
	discount_config: discountConfig(discountValue),
});

describe("reward discount value", () => {
	test("rejects a zero discount on create and update", () => {
		expect(
			CreateRewardSchema.safeParse(
				createReward(RewardType.PercentageDiscount, 0),
			).success,
		).toBe(false);
		expect(
			UpdateRewardSchema.safeParse({
				type: RewardType.FixedDiscount,
				discount_config: discountConfig(0),
			}).success,
		).toBe(false);
	});

	test("accepts a positive discount", () => {
		expect(
			CreateRewardSchema.safeParse(
				createReward(RewardType.PercentageDiscount, 10),
			).success,
		).toBe(true);
	});

	test("ignores the unused discount config of a free product", () => {
		expect(
			CreateRewardSchema.safeParse(createReward(RewardType.FreeProduct, 0))
				.success,
		).toBe(true);
	});
});
