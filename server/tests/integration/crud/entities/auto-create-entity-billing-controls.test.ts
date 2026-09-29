/**
 * An entity a check creates from `entity_data` keeps the billing controls it was sent, on both balance routes.
 *
 * Red (before): legacy's auto-create dropped `entity_data.billing_controls`; the balance worker route saved them.
 * Green (after): both save them.
 */

import { expect, test } from "bun:test";
import type { ApiEntityV2, EntityBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const billingControls: EntityBillingControls = {
	spend_limits: [
		{ feature_id: TestFeature.Messages, enabled: true, overage_limit: 25 },
	],
};

test.concurrent(
	`${chalk.yellowBright("auto-create-entity-billing-controls1: a check's auto-created entity keeps its billing controls")}`,
	async () => {
		const plan = products.base({
			id: "auto-create-billing-controls",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "auto-create-entity-billing-controls1";
		const { autumnV1, autumnV2_1 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		// API versions below 2.1 create a missing entity from `entity_data`.
		await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: "entity-1",
			entity_data: {
				feature_id: TestFeature.Users,
				billing_controls: billingControls,
			},
		});

		const entity = await autumnV2_1.entities.get<ApiEntityV2>(
			customerId,
			"entity-1",
		);
		expect(entity.billing_controls?.spend_limits).toEqual(
			billingControls.spend_limits,
		);
	},
);
