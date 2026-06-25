/**
 * Multi-plan collapse for overage_allowed: with two attached plans, one
 * enabling overage and one disabling it, `false` wins — overage is disabled.
 * Proves pickStricterOverageAllowed regardless of attach order.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const overageAllowed = (enabled: boolean) => ({
	overage_allowed: [{ feature_id: TestFeature.Messages, enabled }],
});

test.concurrent(
	`${chalk.yellowBright("plan-overage-restrictive: with two plans, overage_allowed:false wins over true")}`,
	async () => {
		const basePlan = products.base({
			id: "plan-overage-restrictive-base",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
		});
		const addOnPlan = products.base({
			id: "plan-overage-restrictive-addon",
			isAddOn: true,
			items: [items.lifetimeMessages({ includedUsage: 100 })],
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "plan-overage-restrictive-1",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [basePlan, addOnPlan] }),
			],
			actions: [
				// Base ENABLES overage; add-on (attached last) DISABLES it.
				s.billing.attach({
					productId: basePlan.id,
					billingControls: overageAllowed(true),
				}),
				s.billing.attach({
					productId: addOnPlan.id,
					billingControls: overageAllowed(false),
				}),
			],
		});

		// false wins -> overage disabled -> granted (200 across both free items)
		// caps the usage. Track past it; usage stops at granted.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 260,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 200,
		});
	},
);
