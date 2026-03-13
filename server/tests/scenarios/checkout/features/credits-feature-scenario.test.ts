import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Credits Feature Scenario
 *
 * Tests attaching a product with credit-based (prepaid) features.
 * Customer purchases credits upfront that can be used for various actions.
 */

test(`${chalk.yellowBright("attach: credits - credit-based feature")}`, async () => {
	const customerId = "credits-feature";

	// Pro plan with credit system ($20/mo base + credits for actions)
	// Credits feature maps to action1 (0.2 credits) and action2 (0.6 credits)
	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyCredits({ includedUsage: 100 }), // 100 free credits per month
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

	// Options for additional prepaid credits
	const creditOptions = [
		{ feature_id: TestFeature.Credits, quantity: 500 }, // Purchase 500 additional credits
	];

	// 1. Preview attach with credit options
	const attachPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: creditOptions,
		redirect_mode: "always",
	});
	console.log("credits attach preview:", attachPreview);

	// 2. Attach product with credits (Autumn checkout URL)
	const attachResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		options: creditOptions,
		redirect_mode: "always",
	});
	console.log("credits attach result:", attachResult);

	// Get customer state after attach
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after credits attach:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
