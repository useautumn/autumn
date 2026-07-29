/**
 * A plan-default overage_allowed:true enables overage on a free feature when the
 * customer/entity have no control of their own. The plan-level control on the
 * product resolves through resolveBillingControl and overrides usage_allowed at
 * deduction-prep, so the balance may go negative.
 */

import { test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("plan-default-overage-allowed: a PLAN-DEFAULT overage_allowed:true enables overage on a free feature")}`,
	async () => {
		const prod = products.base({
			id: "plan-default-overage-allowed",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			billingControls: {
				overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
			},
		});

		const { autumnV2_1, customerId } = await initScenario({
			customerId: "plan-default-overage-allowed-1",
			setup: [s.customer({ testClock: false }), s.products({ list: [prod] })],
			actions: [
				s.billing.attach({
					productId: prod.id,
				}),
			],
		});

		// Without the plan control a free feature caps at 100; here it goes past.
		await autumnV2_1.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 130,
		});

		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining: 0,
			usage: 130,
		});
	},
);
