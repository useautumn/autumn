import { test } from "bun:test";

import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Downgrade Plan Scenario
 *
 * Tests downgrading from a premium plan to a basic cheaper plan.
 * Customer starts with a pro plan attached, then downgrades to starter.
 */

test(`${chalk.yellowBright("attach: downgrade - from pro to starter plan")}`, async () => {
	const customerId = "attach-downgrade";

	// Starter plan ($19/mo) - basic features
	const starter = products.base({
		id: "starter",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	// Pro plan ($49/mo) - more features, higher limits
	const pro = products.base({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
			items.prepaidUsers({ includedUsage: 3, billingUnits: 1 }),
			items.monthlyPrice({ price: 49 }),
		],
	});

	// Options for prepaid features in pro plan
	const proOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	// Setup: customer with payment method and pro plan already attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [
			// Attach pro plan first with prepaid users
			s.attach({ productId: "pro", options: proOptions }),
		],
	});

	// Get customer state after initial attach
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the downgrade
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `starter_${customerId}`,
		redirect_mode: "always",
	});
	console.log("downgrade preview:", downgradePreview);

	// 2. Perform the downgrade with redirect_mode: "always" (Autumn checkout URL)
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `starter_${customerId}`,
		redirect_mode: "always",
	});
	console.log("downgrade result:", downgradeResult);
});
