import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Allocated Feature Scenario
 *
 * Tests attaching a product with allocated (per-seat) features.
 * Customer is billed with proration when seat count changes mid-cycle.
 */

test(`${chalk.yellowBright("attach: allocated - per-seat feature")}`, async () => {
	const customerId = "allocated-feature";

	// Pro plan with allocated seats ($20/mo base + $10/seat prorated)
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.allocatedUsers({ includedUsage: 2 }), // 2 free seats, then $10/seat prorated
			items.allocatedWorkflows({ includedUsage: 1 }), // 1 free workflow, then $10/workflow prorated
		],
	});

	// Setup: customer with payment method
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach with allocated features
	const attachPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("allocated attach preview:", attachPreview);

	// 2. Attach product with allocated features (Autumn checkout URL)
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("allocated attach result:", attachResult);

	// Get customer state after attach
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after allocated attach:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
