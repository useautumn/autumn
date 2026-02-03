import { expect, test } from "bun:test";
import type { GetCheckoutResponse } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import axios from "axios";
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

		// 1. Start trial with redirect_mode: "always" (Autumn checkout URL)
		const trialResult = await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: `pro-trial_${customerId}`,
			redirect_mode: "always",
		});
		console.log("trial start result:", trialResult);

		// 2. Extract checkout ID from URL and fetch checkout data
		const checkoutUrl = trialResult.payment_url ?? trialResult.url;
		if (!checkoutUrl) {
			console.log("No checkout URL returned");
			return;
		}

		// Parse checkout ID from URL (format: .../c/{checkout_id} or .../checkouts/{checkout_id})
		const checkoutId =
			checkoutUrl.split("/c/")[1] ?? checkoutUrl.split("/checkouts/")[1];
		console.log("checkout ID:", checkoutId);

		// 3. Fetch checkout data from the public checkout endpoint
		const checkoutResponse = await axios.get<GetCheckoutResponse>(
			`http://localhost:8080/checkouts/${checkoutId}`,
			{ timeout: 10000 },
		);
		const checkoutData = checkoutResponse.data;
		console.log("checkout data:", JSON.stringify(checkoutData, null, 2));

		// Verify free_trial is populated
		const incomingPlan = checkoutData.incoming?.[0]?.plan;
		console.log("free_trial:", incomingPlan?.free_trial);
		console.log(
			"trial_available:",
			incomingPlan?.customer_eligibility?.trial_available,
		);

		// Assertions
		expect(incomingPlan?.free_trial).toBeDefined();
		expect(incomingPlan?.free_trial?.duration_type).toBe("day");
		expect(incomingPlan?.free_trial?.duration_length).toBe(7);
		expect(incomingPlan?.free_trial?.card_required).toBe(true);
		expect(incomingPlan?.customer_eligibility?.trial_available).toBe(true);
	},
	{ timeout: 30000 },
);
