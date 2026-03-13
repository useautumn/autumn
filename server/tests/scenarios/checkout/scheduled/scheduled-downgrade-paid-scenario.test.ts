import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Scheduled Downgrade Between Paid Plans Scenario
 *
 * Tests downgrading from a premium plan to a cheaper paid plan.
 * Downgrade is automatically scheduled for end of billing cycle.
 * Customer has premium ($50/mo), then downgrades to pro ($20/mo) (scheduled).
 */

test(`${chalk.yellowBright("attach: scheduled downgrade - premium to pro")}`, async () => {
	const customerId = "scheduled-downgrade-paid";

	// Premium plan ($50/mo) - top tier features
	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
			items.allocatedUsers({ includedUsage: 10 }),
		],
	});

	// Pro plan ($20/mo) - mid tier features
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({ includedUsage: 500 }),
			items.consumableWords({ includedUsage: 200 }),
		],
	});

	// Setup: customer with payment method and premium plan attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [
			// Attach premium plan first
			s.attach({ productId: "premium" }),
		],
	});

	// Get customer state after initial attach
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before scheduled downgrade to pro:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the downgrade to pro (will be scheduled for end of cycle)
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to pro preview:", downgradePreview);

	// 2. Perform the downgrade (automatically scheduled for end of cycle)
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("scheduled downgrade to pro result:", downgradeResult);

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
