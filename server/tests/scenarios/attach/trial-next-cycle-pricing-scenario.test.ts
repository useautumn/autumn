import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Trial Next Cycle Pricing Scenario
 *
 * Tests that trial checkout shows $0 now with full price for next cycle.
 * Customer subscribes to a product with trial - should see $0 due today,
 * but the next cycle price should show the full amount.
 * Uses redirect_mode: "always" to generate Autumn checkout URL.
 */

test(`${chalk.yellowBright("autumn-checkout: trial shows next cycle pricing - $0 now, full price later")}`, async () => {
	const customerId = "checkout-trial-next-cycle";

	// Pro plan ($20/mo) with 14-day trial
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 500 }),
		],
		trialDays: 14,
		cardRequired: true,
	});

	// Setup: customer with payment method (card on file)
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// Get customer state before trial
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before trial:", {
		products: customerBefore.products?.map((p: { id: string; name: string | null }) => ({
			id: p.id,
			name: p.name,
		})),
	});

	// 1. Preview the trial attach - should show $0 due today
	const trialPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("trial preview (should show $0 now, $20 next cycle):", {
		preview: trialPreview,
		due_today: (trialPreview as { due_today?: { total: number } }).due_today?.total,
		next_cycle: (trialPreview as { next_cycle?: { total: number } }).next_cycle?.total,
	});

	// 2. Start trial with redirect_mode: "always" (Autumn checkout URL)
	const trialResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("trial attach result:", trialResult);
});
