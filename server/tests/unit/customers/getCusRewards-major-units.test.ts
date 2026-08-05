/**
 * Before: customer rewards returned fixed discounts in Stripe minor units.
 * After: customer rewards return fixed discounts in Autumn major units.
 */
import { afterAll, describe, expect, mock, test } from "bun:test";
import {
	AppEnv,
	CouponDurationType,
	CustomerExpand,
	RewardType,
} from "@autumn/shared";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

await mockModuleWithRestore("@/external/connect/createStripeCli.js", () => ({
	createStripeCli: () => ({
		customers: {
			retrieve: async () => ({
				id: "cus_stripe_123",
				discount: {
					coupon: {
						id: "fixed-250",
						name: "$250 off",
						amount_off: 25000,
						percent_off: null,
						currency: "usd",
						duration: "once",
						duration_in_months: null,
					},
					start: 1_700_000_000,
					end: null,
					subscription: null,
				},
			}),
		},
	}),
}));

const { getCusRewards } = await import(
	"@/internal/customers/cusUtils/cusResponseUtils/getCusRewards.js"
);

describe("getCusRewards", () => {
	test("returns fixed discounts in major units", async () => {
		const rewards = await getCusRewards({
			org: { id: "org_123" } as never,
			env: AppEnv.Sandbox,
			fullCus: {
				processor: { id: "cus_stripe_123" },
			} as never,
			expand: [CustomerExpand.Rewards],
		});

		expect(rewards?.discounts).toHaveLength(1);
		expect(rewards?.discounts[0]).toMatchObject({
			id: "fixed-250",
			name: "$250 off",
			type: RewardType.FixedDiscount,
			discount_value: 250,
			currency: "usd",
			duration_type: CouponDurationType.OneOff,
			duration_value: 0,
		});
	});
});

afterAll(() => {
	mock.restore();
});
