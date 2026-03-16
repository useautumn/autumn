import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Prepaid Quantities Scenario
 *
 * Tests attaching a product with prepaid quantity options.
 * Customer purchases upfront units for prepaid features.
 */

test(`${chalk.yellowBright("attach: prepaid quantities - with prepaid options")}`, async () => {
	const customerId = "prepaid-quantities";

	// Pro plan with prepaid features ($20/mo base + prepaid units)
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.prepaidMessages({ includedUsage: 50, billingUnits: 100 }), // $10 per 100 messages
			items.prepaidUsers({ includedUsage: 2, billingUnits: 1 }), // $10 per user seat
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

	// Prepaid options - purchase additional units upfront
	const prepaidOptions = [
		{ feature_id: TestFeature.Messages, quantity: 500 }, // 5 packs of 100
		{ feature_id: TestFeature.Users, quantity: 5 }, // 5 user seats
	];

	// 1. Preview attach with prepaid quantities
	const attachPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: prepaidOptions,
		redirect_mode: "always",
	});
	console.log("prepaid attach preview:", attachPreview);

	// 2. Attach with prepaid quantities (Autumn checkout URL)
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: prepaidOptions,
		redirect_mode: "always",
	});
	console.log("prepaid attach result:", attachResult);

	// Get customer state after attach
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after prepaid attach:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
