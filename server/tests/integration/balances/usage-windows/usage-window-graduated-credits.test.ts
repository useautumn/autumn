/**
 * A usage cap on a credit system counts the credits a draw actually cost, tier by tier.
 * TieredAction draws TieredCredits at 1 credit per 100 units up to 10,000 units, then 0.8.
 *
 * Red (before): the worker counted `units × row.creditCost`, a flat rate, so a draw across the tier
 *   boundary recorded the wrong usage and later draws could use headroom already spent.
 * Green (after): the counter moves by the credits drawn — 99.5, then 0.5 + 0.4 across the boundary.
 */

import { test } from "bun:test";
import { ApiVersion, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "../utils/usage-limit-utils/customerUsageLimitUtils.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("usage-window-graduated-credits1: a draw across a tier boundary counts the credits it cost")}`,
	async () => {
		const creditPlan = products.base({
			id: "uw-graduated-credits",
			items: [
				items.consumable({
					featureId: TestFeature.TieredCredits,
					includedUsage: 1_000,
					price: 1,
					billingUnits: 1,
				}),
			],
		});
		const customerId = "uw-graduated-credits-1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [creditPlan] }),
			],
			actions: [s.billing.attach({ productId: creditPlan.id })],
		});
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			limit: 500,
			interval: ResetInterval.Day,
		});

		// Within the first tier: 9,950 units at 1 credit per 100.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 9_950,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			usage: 99.5,
			limit: 500,
		});

		// Across the boundary: 50 units at 1 per 100, then 50 at 0.8 per 100.
		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.TieredAction,
			value: 100,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.TieredCredits,
			usage: 100.4,
			limit: 500,
		});
	},
);
