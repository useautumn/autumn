/**
 * Attach Metadata Tests
 *
 * Tests for the first-class `metadata` field on attach params.
 * Verifies that user-provided metadata is correctly passed through to
 * Stripe subscriptions, invoices, and checkout sessions, while ensuring
 * Autumn's reserved `autumn_*` keys are never overridden.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV1Input } from "@autumn/shared";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: metadata passthrough on subscription (non-checkout flow)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("metadata: passthrough to subscription")}`, async () => {
	const customerId = "attach-metadata-sub-invoice";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-metadata-passthrough",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		metadata: {
			user_id: "u-123",
			campaign: "summer",
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription has user-provided metadata
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

	const subscription = subs.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subscription).toBeDefined();
	expect(subscription!.metadata.user_id).toBe("u-123");
	expect(subscription!.metadata.campaign).toBe("summer");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: autumn_* prefixed keys are stripped from user metadata
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("metadata: autumn_* keys are stripped")}`, async () => {
	const customerId = "attach-metadata-strip-autumn";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-metadata-strip",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		metadata: {
			user_id: "u-456",
			autumn_evil: "hacked",
			autumn_billing_update: "overridden",
		},
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

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

	const subscription = subs.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subscription).toBeDefined();

	// User's safe key should be present
	expect(subscription!.metadata.user_id).toBe("u-456");

	// Autumn-prefixed keys should NOT be on the subscription
	expect(subscription!.metadata.autumn_evil).toBeUndefined();
	expect(subscription!.metadata.autumn_billing_update).toBeUndefined();
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: metadata passthrough via Stripe checkout flow
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("metadata: passthrough via Stripe checkout")}`, async () => {
	const customerId = "attach-metadata-checkout";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-metadata-checkout",
		items: [messagesItem],
	});

	const { autumnV1, autumnV2_1, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const result = await autumnV2_1.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: pro.id,
		metadata: {
			source: "web",
			campaign_id: "camp-789",
		},
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify Stripe subscription has user-provided metadata
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

	const subscription = subs.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subscription).toBeDefined();
	expect(subscription!.metadata.source).toBe("web");
	expect(subscription!.metadata.campaign_id).toBe("camp-789");
});
