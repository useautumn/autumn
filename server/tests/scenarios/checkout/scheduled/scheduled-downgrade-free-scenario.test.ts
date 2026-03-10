import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Scheduled Downgrade to Free Scenario
 *
 * Tests downgrading from a paid plan to a free plan.
 * Downgrade is automatically scheduled for end of billing cycle.
 * Customer has pro, then downgrades to free (scheduled).
 */

test(`${chalk.yellowBright("attach: scheduled downgrade - pro to free")}`, async () => {
	const customerId = "scheduled-downgrade-free";

	// Pro plan ($20/mo) - paid features
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
		],
	});

	// Free plan ($0/mo) - basic features only
	const free = products.base({
		id: "free",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 50 })],
	});

	// Setup: customer with payment method and pro plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			// Attach pro plan first
			s.attach({ productId: "pro" }),
		],
	});

	// Get customer state after initial attach
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before scheduled downgrade to free:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the downgrade to free (will be scheduled for end of cycle)
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `free_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to free preview:", downgradePreview);

	// 2. Perform the downgrade (automatically scheduled for end of cycle)
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `free_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to free result:", downgradeResult);

	// Get customer state after scheduled downgrade
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after scheduled downgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
