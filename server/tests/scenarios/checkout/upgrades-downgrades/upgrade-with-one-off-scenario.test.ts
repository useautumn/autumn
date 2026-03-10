import { test } from "bun:test";
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
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyPrice({ price: 19 }),
		],
	});

	// Pro plan ($49/mo) - more features, higher limits
	const pro = products.base({
		id: "pro",
		items: [
			items.consumableWords({ includedUsage: 200 }),
			items.oneOffMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
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
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
		// options: proOptions,
	});
	console.log("upgrade result:", upgradeResult);
});
