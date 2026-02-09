import { test } from "bun:test";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Trial Ends on Upgrade Scenario
 *
 * Tests upgrading from a trialing product to a higher tier without trial.
 * Customer is on pro trial, upgrades to premium (no trial) - trial ends immediately.
 * Uses redirect_mode: "always" to generate Autumn checkout URL.
 */

test(`${chalk.yellowBright("autumn-checkout: pro trial → premium (no trial) - Trial ends on upgrade")}`, async () => {
	const customerId = "checkout-trial-ends-upgrade";

	// Pro plan ($20/mo) with 7-day trial
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 200 })],
		trialDays: 7,
		cardRequired: true,
	});

	// Premium plan ($50/mo) - no trial, immediate billing
	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({ includedUsage: 1000 }),
			items.consumableWords({ includedUsage: 500 }),
		],
	});

	// Setup: customer with payment method and pro trial attached
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premium] }),
		],
		actions: [s.attach({ productId: "pro-trial" })],
	});

	// Verify pro-trial is trialing before upgrade
	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	// 1. Preview the upgrade from trial to non-trial
	await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		redirect_mode: "always",
	});

	// 2. Perform the upgrade with redirect_mode: "always" (Autumn checkout URL)
	// This should end the trial and start billing immediately
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		redirect_mode: "always",
	});

	// Verify premium is active and not trialing after upgrade
	await expectProductNotTrialing({
		customerId,
		productId: premium.id,
	});
});
