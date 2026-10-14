import { expect, test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerBalance,
	expectCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("uw-multi-cap1: individual caps on action1 and action2 over shared credits")}`,
	async () => {
		const freePlan = products.base({
			id: "uw-multi-cap-credits",
			items: [items.monthlyCredits({ includedUsage: 100 })],
		});

		const customerId = "uw-multi-cap-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freePlan] }),
			],
			actions: [s.billing.attach({ productId: freePlan.id })],
		});

		await timeout(2000);
		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: TestFeature.Action1,
						limit: 5,
						interval: ResetInterval.Month,
					},
					{
						feature_id: TestFeature.Action2,
						limit: 4,
						interval: ResetInterval.Month,
					},
				],
			},
		});
		await timeout(3000);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 3,
		});

		const action1Within = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 2,
		});
		expect(action1Within.allowed).toBe(true);

		const action1Beyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 3,
		});
		expect(action1Beyond.allowed).toBe(false);

		const action2Fresh = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 4,
		});
		expect(action2Fresh.allowed).toBe(true);

		const action2FreshBeyond = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 5,
		});
		expect(action2FreshBeyond.allowed).toBe(false);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 2,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			value: 5,
		});

		const action1Exhausted = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
		});
		expect(action1Exhausted.allowed).toBe(false);

		const action2StillOpen = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			required_balance: 2,
		});
		expect(action2StillOpen.allowed).toBe(true);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Action2,
			value: 5,
		});

		await timeout(3000);
		await expectCustomerBalance({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Credits,
			granted: 100,
			remaining: 96.6,
			usage: 3.4,
		});

		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action1,
			usage: 5,
			limit: 5,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Action2,
			usage: 4,
			limit: 4,
		});

		const creditsCheck = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Credits,
			required_balance: 50,
		});
		expect(creditsCheck.allowed).toBe(true);
	},
);
