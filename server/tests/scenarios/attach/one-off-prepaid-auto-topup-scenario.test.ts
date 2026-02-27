import { test } from "bun:test";
import type { CustomerBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * One-Off Prepaid Auto Top-Up Scenario
 *
 * Sets up a one-off prepaid add-on product with auto top-up configured.
 * Auto top-up requires: one-off price, prepaid usage model, and a payment method.
 *
 * Setup:
 * - One-off add-on: $10 per 100 message credits (no recurring charges)
 * - Customer with payment method, product attached with 100 initial credits
 * - Auto top-up: threshold=20, quantity=100 (triggers when balance drops below 20)
 */

test(`${chalk.yellowBright("one-off-prepaid-auto-topup: one-off prepaid product with auto top-up attached")}`, async () => {
	const customerId = "one-off-prepaid-auto-topup";

	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const oneOffAddOn = products.oneOffAddOn({
		id: "topup-addon",
		items: [oneOffMessagesItem],
	});

	const { autumnV2_1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOffAddOn] }),
		],
		actions: [
			s.attach({
				productId: oneOffAddOn.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	const billingControls: CustomerBillingControls = {
		auto_topups: [
			{
				feature_id: TestFeature.Messages,
				enabled: true,
				threshold: 20,
				quantity: 100,
			},
		],
	};

	await autumnV2_1.customers.update(customerId, {
		billing_controls: billingControls,
	});
});
