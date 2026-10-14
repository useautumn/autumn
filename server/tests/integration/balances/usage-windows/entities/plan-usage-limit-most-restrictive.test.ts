import { test } from "bun:test";
import {
	ApiVersion,
	type CustomerBillingControlsParams,
	ErrCode,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const usageLimit = (limit: number): CustomerBillingControlsParams => ({
	usage_limits: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			limit,
			interval: ResetInterval.Month,
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("plan-restrictive: with two attached plans, the lowest usage_limit wins (not the most recent)")}`,
	async () => {
		const basePlan = products.base({
			id: "plan-restrictive-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			billingControls: usageLimit(5),
		});
		const addOnPlan = products.base({
			id: "plan-restrictive-addon",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 100 })],
			billingControls: usageLimit(20),
		});

		const customerId = "plan-restrictive-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [basePlan, addOnPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: basePlan.id,
				}),
				s.billing.attach({
					productId: addOnPlan.id,
				}),
			],
		});

		await autumnV2_3.customers.get(customerId);

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 5,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
