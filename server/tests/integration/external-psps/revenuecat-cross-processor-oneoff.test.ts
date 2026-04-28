/**
 * TDD: Allow one-off purchases across processors when the other processor
 * already manages an active subscription for the customer.
 *
 * Today we strictly block any cross-processor activity to avoid edge cases
 * with mixed subscriptions. One-offs are safe because they don't replace the
 * existing subscription — they create a parallel cus_product.
 *
 * Red-failure mode (current behavior):
 *  Test 1 — Stripe sub + RC one-off top-up:
 *    resolveRevenuecatResources() throws "Customer already has a product from
 *    a different processor than RevenueCat." → webhook returns 500.
 *
 *  Test 2 — RC sub + Stripe one-off top-up:
 *    handleExternalPSPErrors() throws "This customer is billed outside of
 *    Stripe..." on autumnV1.attach().
 *
 *  Test 3 — Negative guards:
 *    Recurring product cross-processor must STILL be rejected after the fix.
 *
 * Green-success criteria (after fix):
 *  Tests 1 & 2 succeed; both products end up active on the customer.
 *  Test 3 sub-cases continue to throw the cross-processor error.
 */

import { expect, test } from "bun:test";
import { AppEnv, customers } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { RCMappingService } from "@/external/revenueCat/misc/RCMappingService";
import { OrgService } from "@/internal/orgs/OrgService";
import { encryptData } from "@/utils/encryptUtils";
import {
	expectWebhookSuccess,
	RevenueCatWebhookClient,
} from "./utils/revenue-cat-webhook-client";

const RC_WEBHOOK_SECRET = "test_rc_webhook_secret_xproc";

const setupRevenueCatOrg = async () => {
	if (
		ctx.org.processor_configs?.revenuecat?.sandbox_webhook_secret !==
		RC_WEBHOOK_SECRET
	) {
		await OrgService.update({
			db: ctx.db,
			orgId: ctx.org.id,
			updates: {
				processor_configs: {
					...ctx.org.processor_configs,
					revenuecat: {
						api_key: encryptData("mock_rc_api_key_live"),
						sandbox_api_key: encryptData("mock_rc_api_key_sandbox"),
						project_id: "mock_project_live",
						sandbox_project_id: "mock_project_sandbox",
						webhook_secret: RC_WEBHOOK_SECRET,
						sandbox_webhook_secret: RC_WEBHOOK_SECRET,
					},
				},
			},
		});
	}
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Stripe sub + RC one-off top-up
//
// Customer has an active Stripe subscription (proMonthly attached via Stripe).
// They make a one-off in-app top-up via RevenueCat.
// Expected (after fix): RC webhook succeeds; both products are active.
// Currently (red):       resolver guard rejects → 500 from webhook.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 1: stripe sub + rc one-off top-up")}`,
	async () => {
		const customerId = "rc-xproc-1";

		// RevenueCat product ID for the in-app top-up
		const RC_TOP_UP_ID = "com.app.rc_xproc_top_up_pack";

		// Autumn products
		const proMonthly = products.pro({
			id: "rc-xproc-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		// True one-off add-on: pricesOnlyOneOff(prices) === true
		const topUpPack = products.oneOff({
			id: "rc-xproc-top-up-pack",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		// Setup org with RevenueCat config
		await setupRevenueCatOrg();

		// Initialize scenario: customer with payment method, Stripe attaches proMonthly
		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proMonthly, topUpPack] }),
			],
			actions: [s.attach({ productId: proMonthly.id })],
		});

		// Map RC product → Autumn one-off top-up product
		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: topUpPack.id,
				revenuecat_product_ids: [RC_TOP_UP_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		// Sanity check: customer exists and has the Stripe sub
		const dbCustomer = await ctx.db.query.customers.findFirst({
			where: eq(customers.id, customerId),
		});
		expect(dbCustomer).toBeDefined();

		// Action: RC fires NON_RENEWING_PURCHASE for the mapped one-off product
		const result = await rcClient.nonRenewingPurchase({
			productId: RC_TOP_UP_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_1_topup_tx_001",
		});

		// PRIMARY ASSERTION (red here): webhook should succeed
		expectWebhookSuccess(result);

		// State assertion: customer now has both products active
		const customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(2);
		const productIds = customer.products
			.map((p: { id: string }) => p.id)
			.sort();
		expect(productIds).toEqual([proMonthly.id, topUpPack.id].sort());
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: RC sub + Stripe one-off top-up
//
// Customer has an active RevenueCat subscription (proMonthly via RC webhook).
// They buy a one-off pack via Stripe (autumnV1.attach).
// Expected (after fix): attach succeeds; both products are active.
// Currently (red):       handleExternalPSPErrors throws.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 2: rc sub + stripe one-off top-up")}`,
	async () => {
		const customerId = "rc-xproc-2";

		const RC_PRO_MONTHLY_ID = "com.app.rc_xproc_pro_monthly";

		// RC-managed recurring product
		const rcProMonthly = products.pro({
			id: "rc-xproc-2-pro-monthly",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		// Stripe-side true one-off add-on
		const webTopUp = products.oneOff({
			id: "rc-xproc-2-web-top-up",
			items: [items.lifetimeMessages({ includedUsage: 100 })],
			isAddOn: true,
		});

		await setupRevenueCatOrg();

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcProMonthly, webTopUp] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcProMonthly.id,
				revenuecat_product_ids: [RC_PRO_MONTHLY_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		// Step 1: RC initial purchase puts customer on the RC-managed subscription
		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_MONTHLY_ID,
			appUserId: customerId,
			originalTransactionId: "rc_xproc_2_tx_001",
		});
		expectWebhookSuccess(rcResult);

		// Confirm pre-state: 1 product active (RC sub)
		let customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(1);
		expect(customer.products[0].id).toBe(rcProMonthly.id);

		// PRIMARY ACTION (red here): attach the Stripe one-off top-up
		await autumnV1.attach({
			customer_id: customerId,
			product_id: webTopUp.id,
		});

		customer = await autumnV1.customers.get(customerId);
		expect(customer.products).toHaveLength(2);
		const productIds = customer.products
			.map((p: { id: string }) => p.id)
			.sort();
		expect(productIds).toEqual([rcProMonthly.id, webTopUp.id].sort());
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Negative guards — recurring cross-processor must STILL be blocked
//
// Sub-case A: Stripe-subscribed customer → RC INITIAL_PURCHASE for a recurring
//             RC-mapped Autumn product. Webhook must fail (non-200).
// Sub-case B: RC-subscribed customer → autumnV1.attach of a recurring Stripe
//             product. Attach must throw the cross-processor error.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("revenuecat cross-processor 3: negative guards (recurring still blocked)")}`,
	async () => {
		// ─── Sub-case A ────────────────────────────────────────────────────────────
		const customerIdA = "rc-xproc-3a";
		const RC_RECURRING_ID = "com.app.rc_xproc_3a_recurring";

		const stripeProMonthly = products.pro({
			id: "rc-xproc-3a-stripe-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const rcRecurring = products.pro({
			id: "rc-xproc-3a-rc-recurring",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		await setupRevenueCatOrg();

		await initScenario({
			customerId: customerIdA,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [stripeProMonthly, rcRecurring] }),
			],
			actions: [s.attach({ productId: stripeProMonthly.id })],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcRecurring.id,
				revenuecat_product_ids: [RC_RECURRING_ID],
			},
		});

		const rcClient = new RevenueCatWebhookClient({
			orgId: ctx.org.id,
			env: ctx.env,
			webhookSecret: RC_WEBHOOK_SECRET,
		});

		// RC tries to start a recurring sub on a Stripe-subscribed customer → must fail
		const recurringResult = await rcClient.initialPurchase({
			productId: RC_RECURRING_ID,
			appUserId: customerIdA,
			originalTransactionId: "rc_xproc_3a_tx_001",
		});
		expect(recurringResult.response.status).not.toBe(200);

		// ─── Sub-case B ────────────────────────────────────────────────────────────
		const customerIdB = "rc-xproc-3b";
		const RC_PRO_ID_B = "com.app.rc_xproc_3b_pro";

		const rcProB = products.pro({
			id: "rc-xproc-3b-rc-pro",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		// Recurring add-on (NOT a one-off): cross-processor attach should still throw
		const stripeRecurringAddOn = products.recurringAddOn({
			id: "rc-xproc-3b-recurring-addon",
			items: [items.monthlyMessages({ includedUsage: 50 })],
		});

		const { autumnV1 } = await initScenario({
			customerId: customerIdB,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [rcProB, stripeRecurringAddOn] }),
			],
			actions: [],
		});

		await RCMappingService.upsert({
			db: ctx.db,
			data: {
				org_id: ctx.org.id,
				env: AppEnv.Sandbox,
				autumn_product_id: rcProB.id,
				revenuecat_product_ids: [RC_PRO_ID_B],
			},
		});

		const rcResult = await rcClient.initialPurchase({
			productId: RC_PRO_ID_B,
			appUserId: customerIdB,
			originalTransactionId: "rc_xproc_3b_tx_001",
		});
		expectWebhookSuccess(rcResult);

		// Now attempt to attach a recurring Stripe add-on → must throw
		await expect(
			autumnV1.attach({
				customer_id: customerIdB,
				product_id: stripeRecurringAddOn.id,
			}),
		).rejects.toThrow(/Stripe|RevenueCat|external|managed/i);
	},
);
