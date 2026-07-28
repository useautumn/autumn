/**
 * Before: customer rewards returned fixed discounts in Stripe minor units.
 * After: customer rewards return fixed discounts in Autumn major units.
 */
import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CouponDurationType,
	CustomerExpand,
	RewardType,
} from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("customer rewards: returns fixed discounts in major units")}`, async () => {
	const customerId = "customer-fixed-discount-major-units";
	const rewardId = "fixed-250";
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.platform.create(), s.customer({ testClock: false })],
		actions: [],
	});

	await autumnV1.rewards.create({
		id: rewardId,
		name: "$250 off",
		type: RewardType.FixedDiscount,
		promo_codes: [],
		discount_config: {
			discount_value: 250,
			duration_type: CouponDurationType.OneOff,
			duration_value: 0,
			apply_to_all: true,
			price_ids: [],
		},
	});
	await autumnV1.post(`/customers/${customerId}/coupons/${rewardId}`, {});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId, {
		expand: [CustomerExpand.Rewards],
	});

	expect(customer.rewards?.discounts).toHaveLength(1);
	expect(customer.rewards?.discounts[0]?.discount_value).toBe(250);
});
