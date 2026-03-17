import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Prorated Upgrade with Trial Scenario
 *
 * Tests upgrading mid-billing cycle from a paid plan to a higher tier with a trial.
 * Customer starts with pro plan, advances 15 days, then upgrades to premium with trial.
 * This tests the interaction between proration credits and trial periods.
 */

test(`${chalk.yellowBright("checkout: pro → premium with trial mid-cycle (prorated upgrade with trial)")}`, async () => {
	const customerId = "checkout-prorated-upgrade-trial";

	// Pro plan ($20/mo) - no trial
	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 200 })],
	});

	// Premium plan ($50/mo) with 14-day trial
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
		],
		trialDays: 14,
		cardRequired: true,
	});

	// Setup: customer with test clock, payment method, and pro plan attached
	// Then advance 15 days (halfway through billing cycle)
	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
		],
		actions: [
			s.attach({ productId: "pro" }),
			// Advance 15 days - halfway through the billing cycle
			s.advanceTestClock({ days: 15 }),
		],
	});

	console.log("advanced to:", new Date(advancedTo).toISOString());

	// Get customer state after initial attach and clock advance
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before mid-cycle upgrade with trial:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});

	// 1. Preview the prorated upgrade with trial (should show prorated credits + trial)
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("prorated upgrade with trial preview:", upgradePreview);

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium-trial_${customerId}`,
		redirect_mode: "always",
	});
	console.log("prorated upgrade with trial result:", upgradeResult);
});
