/**
 * Attach Miscellaneous Tests
 *
 * Tests for checkout_session_params passthrough to Stripe checkout sessions.
 * Verifies that user-provided subscription_data.metadata and session-level
 * metadata are correctly merged with Autumn's internal params.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: subscription_data.metadata passthrough via Stripe checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with no payment method (forces Stripe checkout)
 * - Attach with checkout_session_params containing subscription_data.metadata
 *
 * Expected Result:
 * - Stripe subscription created after checkout has the user-provided metadata
 * - Autumn's internal metadata (autumn_metadata_id) is also present on the session
 */
test.concurrent(`${chalk.yellowBright("checkout_session_params: subscription_data.metadata passthrough")}`, async () => {
	const customerId = "attach-misc-sub-data-metadata";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-sub-metadata",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method → Stripe checkout
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Attach with checkout_session_params including subscription_data.metadata
	const result = await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		checkout_session_params: {
			subscription_data: {
				metadata: {
					user_id: "test-user-123",
					custom_field: "custom-value",
				},
			},
		},
	});

	// Should return a Stripe checkout URL
	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 2. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 3. Verify product is attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	// 4. Verify Stripe subscription has user-provided metadata
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const subs = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId!,
		status: "all",
	});

	expect(subs.data.length).toBeGreaterThan(0);

	const subscription = subs.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subscription).toBeDefined();

	// Verify user-provided metadata is on the subscription
	expect(subscription!.metadata.user_id).toBe("test-user-123");
	expect(subscription!.metadata.custom_field).toBe("custom-value");
	expect(subscription!.metadata.autumn_managed).toBe("true");
});
