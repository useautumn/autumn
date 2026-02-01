import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Upgrade Plan Scenario
 *
 * Tests upgrading from a basic plan to a more expensive premium plan.
 * Customer starts with a starter plan attached, then upgrades to pro.
 */

test(`${chalk.yellowBright("attach: upgrade - from starter to pro plan")}`, async () => {
	const customerId = "attach-upgrade";

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

	// Setup: customer with payment method and starter plan already attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [starter, pro] }),
		],
		actions: [
			// Attach starter plan first
			s.attach({ productId: "starter" }),
		],
	});

	// Get customer state after initial attach
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before upgrade:", {
		products: customerBefore.products?.map((p: { id: string; name: string }) => ({
			id: p.id,
			name: p.name,
		})),
	});

	// Options for prepaid features in pro plan
	const proOptions = [{ feature_id: TestFeature.Users, quantity: 5 }];

	// 1. Preview the upgrade
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: proOptions,
	});
	console.log("upgrade preview:", upgradePreview);

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
		options: proOptions,
	});
	console.log("upgrade result:", upgradeResult);
});
