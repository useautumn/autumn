import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Consumable Feature Scenario
 *
 * Tests attaching a product with pay-per-use (consumable) features.
 * Customer is billed in arrears for usage beyond included allowance.
 */

test(`${chalk.yellowBright("attach: consumable - pay-per-use feature")}`, async () => {
	const customerId = "consumable-feature";

	// Pro plan with consumable features ($20/mo base + usage overage)
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.consumableMessages({ includedUsage: 100 }), // 100 free, then $0.10/message
			items.consumableWords({ includedUsage: 200 }), // 200 free, then $0.05/word
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

	// 1. Preview attach with consumable features
	const attachPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("consumable attach preview:", attachPreview);

	// 2. Attach product with consumable features (Autumn checkout URL)
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		redirect_mode: "always",
	});
	console.log("consumable attach result:", attachResult);

	// Get customer state after attach
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after consumable attach:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
