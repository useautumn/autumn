import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Trial Start Scenario
 *
 * Tests starting a trial on a paid product from free (no existing product).
 * Customer has a card on file, upgrades to pro with a 7-day trial.
 * Uses redirect_mode: "always" to generate Autumn checkout URL.
 */

test(
	`${chalk.yellowBright("autumn-checkout: free → pro with trial (card on file) - Trial start")}`,
	async () => {
		const customerId = "checkout-trial-start";

		// Free plan - just dashboard access
		const free = products.base({
			id: "free",
			items: [items.dashboard()],
			isDefault: true,
		});

		// Pro plan ($20/mo) with 7-day trial - requires card
		const proTrial = products.proWithTrial({
			id: "pro-trial",
			items: [
				items.dashboard(),
				items.adminRights(),
				items.monthlyMessages({ includedUsage: 500 }),
			],
			trialDays: 7,
			cardRequired: true,
		});

		// Setup: customer with payment method on file, free by default
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", withDefault: true }),
				s.products({ list: [free, proTrial] }),
			],
			actions: [],
		});

		// Get customer state before upgrade
		const customerBefore = await autumnV1.customers.get(customerId);
		console.log("customer before trial start:", {
			products: customerBefore.products?.map(
				(p: { id: string; name: string | null }) => ({
					id: p.id,
					name: p.name,
				}),
			),
		});

		// Start trial with redirect_mode: "always" (Autumn checkout URL)
		const trialResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro-trial_${customerId}`,
			redirect_mode: "always",
		});
		console.log("trial start result:", trialResult);
	},
	{ timeout: 30000 },
);
