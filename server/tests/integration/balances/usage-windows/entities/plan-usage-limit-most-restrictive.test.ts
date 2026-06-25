/**
 * Multi-plan collapse for usage_limits: when a customer has TWO attached plans
 * each carrying a usage_limit for the same feature, the MOST RESTRICTIVE cap
 * (lowest limit) wins — NOT the most recently attached.
 *
 * To distinguish restrictiveness from recency, the LOOSER plan (limit 20) is
 * attached LAST. Recency-wins would yield a cap of 20; most-restrictive yields
 * 5. We assert enforcement at 5.
 *
 * Mechanism: findPlanBillingControl looks up MOST_RESTRICTIVE_BY_KEY for the
 * controlKey and reduces all matching plan entries with pickStricterUsageLimit
 * (lowest limit).
 */

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
		// Base plan: tight cap 5. Add-on: loose cap 20, attached LAST.
		const basePlan = products.base({
			id: "plan-restrictive-base",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOnPlan = products.base({
			id: "plan-restrictive-addon",
			isAddOn: true,
			items: [items.monthlyMessages({ includedUsage: 100 })],
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
					billingControls: usageLimit(5),
				}),
				// Looser plan attached LAST -> recency-wins would pick 20.
				s.billing.attach({
					productId: addOnPlan.id,
					billingControls: usageLimit(20),
				}),
			],
		});

		await autumnV2_3.customers.get(customerId);

		// Track 5 -> hits the restrictive cap. A 6th unit must reject. If recency
		// had won (cap 20), this would still pass.
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
