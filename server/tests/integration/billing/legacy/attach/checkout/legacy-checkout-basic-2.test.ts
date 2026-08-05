/**
 * Legacy Checkout Basic Tests
 *
 * Slice 2 of 2 (see legacy-checkout-basic.test.ts for slice 1).
 *
 * Migrated from:
 * - server/tests/attach/checkout/checkout2.test.ts (one-time add-on via force_checkout)
 *
 * Tests V1 attach behavior through Stripe checkout flows:
 * - One-time add-on purchases with force_checkout
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV1, CheckResponseV0 } from "@autumn/shared";
import { AutumnCli } from "@tests/cli/AutumnCli";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import {
	checkoutSessionIdFromUrl,
	waitForStripeWebhook,
} from "@tests/utils/stripeUtils/waitForStripeWebhook";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: One-time add-on via force_checkout
// (from checkout2)
//
// Scenario:
// - Pro product ($20/month) with Dashboard (boolean), Messages (10 included), Admin (unlimited)
// - One-off add-on with prepaid messages ($9/250 units)
// - Attach Pro, then attach add-on twice via force_checkout
//
// Expected:
// - Customer has Pro and add-on
// - 3 invoices (Pro $20, add-on $9 x2)
// - Messages balance = 10 (Pro) + 500 (add-on purchases) + 500 (second purchase) = 1010
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-checkout 2: one-time add-on via force_checkout")}`,
	async () => {
		const customerId = "legacy-checkout-2";
		const oneTimeQuantity = 500;
		const oneTimeBillingUnits = 250;
		const oneTimePurchaseCount = 2;

		const dashboardItem = items.dashboard();
		const messagesItem = items.monthlyMessages({ includedUsage: 10 });
		const adminItem = items.adminRights();
		const pro = products.pro({
			id: "pro",
			items: [dashboardItem, messagesItem, adminItem],
		});

		const oneOffItem = items.oneOffMessages({
			price: 9,
			billingUnits: oneTimeBillingUnits,
			includedUsage: 0,
		});
		const oneOff = products.oneOffAddOn({
			id: "one_off",
			items: [oneOffItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: true }),
				s.products({ list: [pro, oneOff] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Purchase one-off add-on twice via force_checkout
		for (let i = 0; i < oneTimePurchaseCount; i++) {
			const res = await autumnV1.attach({
				customer_id: customerId,
				product_id: oneOff.id,
				force_checkout: true,
			});

			await completeStripeCheckoutFormV2({
				url: res.checkout_url,
				overrideQuantity: oneTimeQuantity / oneTimeBillingUnits,
			});

			// Each purchase must land before the next, or the balances compound wrong.
			const purchasesSoFar = i + 1;
			await waitForStripeWebhook({
				stripeCli: ctx.stripeCli,
				env: ctx.env,
				types: ["checkout.session.completed"],
				objectId: checkoutSessionIdFromUrl(res.checkout_url),
				until: async () => {
					const customer = (await AutumnCli.getCustomer(
						customerId,
					)) as ApiCustomerV1;
					const addOn = customer.entitlements.find(
						(entitlement) =>
							entitlement.feature_id === TestFeature.Messages &&
							entitlement.interval === "lifetime",
					);
					return (addOn?.balance ?? 0) >= oneTimeQuantity * purchasesSoFar;
				},
			});
		}

		const cusRes = (await AutumnCli.getCustomer(customerId)) as ApiCustomerV1;

		// Find the add-on balance for Messages with lifetime interval (one-time purchase)
		const addOnBalance = cusRes.entitlements.find(
			(e) => e.feature_id === TestFeature.Messages && e.interval === "lifetime",
		);
		const expectedAddOnBalance = oneTimeQuantity * oneTimePurchaseCount;
		expect(addOnBalance?.balance).toBe(expectedAddOnBalance);

		expect(cusRes.add_ons).toHaveLength(1);
		expect(cusRes.add_ons[0].id).toBe(oneOff.id);
		expect(cusRes.invoices.length).toBe(1 + oneTimePurchaseCount);

		// Verify /check returns correct combined balance
		const res = (await AutumnCli.entitled(
			customerId,
			TestFeature.Messages,
		)) as CheckResponseV0;
		expect(res.allowed).toBe(true);

		const proMeteredAmt = 10;
		const messagesBalance = res.balances.find(
			(b) => b.feature_id === TestFeature.Messages,
		);
		expect(messagesBalance?.balance).toBe(proMeteredAmt + expectedAddOnBalance);
	},
);
