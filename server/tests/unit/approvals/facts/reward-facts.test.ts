import { describe, expect, test } from "bun:test";
import type { ApprovalCustomerFacts } from "@autumn/shared/api/approvals/evaluate/index.js";
import { rewardRedeemToFacts } from "@/internal/approvals/facts/rewards/rewardRedeemToFacts";

const customer = {
	id: "cus_1",
	customer_products: [],
	has_paid: true,
} as unknown as ApprovalCustomerFacts;

describe("reward facts", () => {
	test("rewards.redeem names the reward and passes the customer's facts through", () => {
		expect(
			rewardRedeemToFacts({ customer, reward: { id: "rew_launch" } }),
		).toEqual({ customer, reward_id: "rew_launch" });
	});
});
