/**
 * Stripe Checkout — Top-level enable_plan_immediately
 *
 * Feature under test (currently unimplemented — these tests are RED on purpose):
 * - Top-level `enable_plan_immediately` on attach params (no longer nested under `invoice_mode`).
 * - When set on a stripe_checkout flow, the customer_product is inserted as Active
 *   BEFORE the customer completes the Stripe-hosted checkout, with a new
 *   `stripe_checkout_session_id` column linking the row to the pending session.
 * - On checkout.session.completed, the webhook patches `subscription_ids` and
 *   reconciles the Stripe subscription to match cusProduct items (e.g. prepaid
 *   quantities) — so prepaid balances should land correctly post-completion.
 * - On checkout.session.expired, the row is cleaned up.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV0Input,
	CusProductStatus,
	customers,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

// Parses the cs_xxx checkout session id out of a Stripe-hosted checkout URL.
const parseCheckoutSessionId = (url: string): string | null => {
	const match = url.match(/\/c\/pay\/(cs_[^/?#]+)/);
	return match?.[1] ?? null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Happy path — pre-insert at attach time, webhook patches subscription_ids
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("stripe-checkout enable_plan_immediately: pre-inserts cusProduct, webhook links sub")}`, async () => {
	const customerId = "stripe-checkout-eppi-happy";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-eppi-happy",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → stripe_checkout
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Resolve internal customer id once for direct DB lookups below.
	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	expect(dbCustomer).toBeDefined();
	const internalCustomerId = dbCustomer!.internal_id;

	// 1. Attach with the new top-level enable_plan_immediately flag.
	// V1_Beta (V0) shape; `enable_product_immediately` is mapped to the new
	// top-level `enable_plan_immediately` by V1.2_AttachParamsChange.
	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		enable_product_immediately: true,
	};
	const result = await autumnV1.billing.attach(attachParams);

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	const checkoutSessionId = parseCheckoutSessionId(result.payment_url!);
	expect(checkoutSessionId).toBeTruthy();

	// 2. BEFORE completing the form, the cusProduct should already exist as Active
	// and be linked to the checkout session via stripe_checkout_session_id.
	const cusProductsBeforeCheckout = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});

	const proCusProductBefore = cusProductsBeforeCheckout.find(
		(cp) => cp.product.id === pro.id,
	);
	expect(proCusProductBefore).toBeDefined();
	expect(proCusProductBefore!.status).toBe(CusProductStatus.Active);
	expect(proCusProductBefore!.subscription_ids ?? []).toHaveLength(0);

	expect(proCusProductBefore!.stripe_checkout_session_id).toBe(
		checkoutSessionId,
	);

	// API view should also report the product as active immediately.
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	// 3. Customer completes the Stripe-hosted checkout.
	await completeStripeCheckoutForm({ url: result.payment_url! });

	// 4. After completion: same cusProduct row, now with subscription_ids patched.
	const cusProductsAfter = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	const proCusProductAfter = cusProductsAfter.find(
		(cp) => cp.product.id === pro.id,
	);
	expect(proCusProductAfter).toBeDefined();
	expect(proCusProductAfter!.id).toBe(proCusProductBefore!.id); // same row
	expect(proCusProductAfter!.subscription_ids ?? []).toHaveLength(1);

	// 5. Prepaid quantity must have been reconciled into the Stripe subscription
	//    AND into Autumn's entitlement balances (proves modifyStripeSubscription
	//    + balance setup ran during webhook handling).
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer: customerAfter, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 300,
		balance: 300,
		usage: 0,
	});

	// 6. Single invoice issued: $20 base + 2 paid packs @ $10 = $40.
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 40,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Abandoned checkout — cusProduct cleaned up on session.expired
// ═══════════════════════════════════════════════════════════════════════════════

// NOTE: Skipped until the implementation lands. Stripe checkout sessions auto-expire
// 24h after creation; we'll drive expiry via `s.advanceTestClock` once the handler
// for `checkout.session.expired` exists. The assertions are written out so flipping
// `test.skip` → `test.concurrent` is the only change needed.
test.skip(`${chalk.yellowBright("stripe-checkout enable_plan_immediately: expired session cleans up cusProduct")}`, async () => {
	const customerId = "stripe-checkout-eppi-expired";

	const prepaidMessagesItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro-eppi-expired",
		items: [prepaidMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const dbCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	const internalCustomerId = dbCustomer!.internal_id;

	// 1. Attach with enable_plan_immediately, do NOT complete the form.
	// V1_Beta (V0) shape; `enable_product_immediately` is mapped to the new
	// top-level `enable_plan_immediately` by V1.2_AttachParamsChange.
	const attachParams: AttachParamsV0Input = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		enable_product_immediately: true,
	};
	const result = await autumnV1.billing.attach(attachParams);
	expect(result.payment_url).toBeDefined();

	// Sanity: cusProduct exists Active before expiry.
	const before = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	expect(before.some((cp) => cp.product.id === pro.id)).toBe(true);

	// 2. Drive past the Stripe session expiry (sessions auto-expire after 24h).
	// TODO: replace with the proper test-clock advance helper once we wire up
	// `checkout.session.expired` simulation alongside the implementation.
	// For now this test is `.skip`'d so the typed shape doesn't have to be exact.
	void s;

	// 3. After expiry: cusProduct should no longer be Active.
	const after = await CusProductService.list({
		db: ctx.db,
		internalCustomerId,
		inStatuses: [CusProductStatus.Active],
	});
	expect(after.some((cp) => cp.product.id === pro.id)).toBe(false);

	// API view: pro is not active.
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expect(
		expectProductActive({ customer: customerAfter, productId: pro.id }),
	).rejects.toThrow();
});
