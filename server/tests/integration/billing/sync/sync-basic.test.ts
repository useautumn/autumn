/**
 * Sync Basic Tests
 *
 * Tests the Stripe → Autumn sync flow: fetching proposals from Stripe
 * subscriptions and executing sync to create Autumn customer products.
 *
 * Test A: Customer has no product. Create a Stripe sub using Pro's real
 *         Stripe price ID, then sync it → Pro should be active.
 *
 * Test B: Customer starts on Free. Create a Stripe sub for Pro, sync
 *         with expire_previous → Free should be expired, Pro active.
 *
 * Test C: Pro + add-on in a single Stripe subscription → sync both.
 *
 * Test D: Two separate Stripe subscriptions for the same customer.
 *
 * Test E: Sync after advancing test clock by 2 weeks (reset anchoring).
 *
 * Test F: Sync a trialing Stripe subscription — customer product should be
 *         Trialing with trial_ends_at matching Stripe's trial_end.
 *
 * Test G: Stripe subscription with an inline (ad-hoc) price that doesn't
 *         exist in Autumn — proposals should still list it with price metadata.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import type {
	SyncProposal,
	SyncProposalsResponse,
} from "@/internal/billing/v2/actions/sync/syncProposals";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import {
	createStripeSubscriptionFromProduct,
	createStripeSubscriptionFromProducts,
	getAllStripePriceIds,
} from "./utils/syncTestUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST A: Sync Pro subscription onto a customer with no existing product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: sync Pro onto empty customer")}`, async () => {
	const customerId = "sync-basic-empty";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Create a Stripe subscription using the real Stripe price ID
	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");

	// 2. Fetch sync proposals — should find the subscription and auto-match
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	expect(proposalsResponse.proposals.length).toBeGreaterThanOrEqual(1);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.stripe_subscription_status).toBe("active");

	// Verify at least one item was auto-matched to our product
	const matchedItem = matchedProposal!.items.find(
		(item) => item.matched_plan_id === pro.id,
	);
	expect(matchedItem).toBeDefined();

	// 3. Execute sync
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
			},
		],
	});

	expect(syncResult.results).toBeDefined();
	expect(syncResult.results[0].success).toBe(true);

	// 4. Verify customer now has the Pro product active
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

	// 5. Clean up: cancel the Stripe subscription we created directly
	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Sync Pro subscription onto a customer that starts with Free
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: sync Pro onto customer with Free, expire previous")}`, async () => {
	const customerId = "sync-basic-free-to-pro";

	const messagesItem = items.monthlyMessages({ includedUsage: 50 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
		group: "main",
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
		group: "main",
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro] }),
		],
		actions: [s.attach({ productId: free.id })],
	});

	// Verify customer starts with Free active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: free.id,
	});

	// 1. Create a Stripe subscription using Pro's real Stripe price ID
	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.status).toBe("active");

	// 2. Fetch sync proposals
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();

	// 3. Execute sync with expire_previous: true
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
				expire_previous: true,
			},
		],
	});

	expect(syncResult.results[0].success).toBe(true);

	// 4. Verify Pro is active, Free is expired (no longer in active products)
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Free should no longer be in the active products list
	const freeProduct = (customerAfter.products ?? []).find(
		(p: { id?: string }) => p.id === free.id,
	);
	expect(freeProduct === undefined || freeProduct.status === "expired").toBe(
		true,
	);

	// Verify messages feature now reflects Pro's allowance
	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Pro + add-on in a single Stripe subscription
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: pro + add-on in single Stripe subscription")}`, async () => {
	const customerId = "sync-basic-pro-addon";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const usersItem = items.monthlyUsers({ includedUsage: 5 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [usersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	// 1. Create a single Stripe subscription with items from both products
	const stripeSubscription = await createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [pro.id, addon.id],
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");
	expect(stripeSubscription.items.data.length).toBeGreaterThanOrEqual(2);

	// 2. Fetch sync proposals
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.items.length).toBeGreaterThanOrEqual(2);

	// 3. Execute sync — map to both Pro and Add-on
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
			},
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: addon.id,
			},
		],
	});

	expect(syncResult.results).toBeDefined();
	expect(syncResult.results.length).toBe(2);

	// 4. Verify both products are active
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: addon.id });

	// 5. Clean up
	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST D: Two separate Stripe subscriptions for the same customer
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: two separate Stripe subscriptions")}`, async () => {
	const customerId = "sync-basic-two-subs";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
		group: "main",
	});

	const usersItem = items.monthlyUsers({ includedUsage: 10 });
	const premium = products.premium({
		id: "premium",
		items: [usersItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	// 1. Create two separate Stripe subscriptions
	const [stripeSub1, stripeSub2] = await Promise.all([
		createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: pro.id,
		}),
		createStripeSubscriptionFromProduct({
			ctx,
			customerId,
			productId: premium.id,
		}),
	]);

	expect(stripeSub1.id).toBeDefined();
	expect(stripeSub2.id).toBeDefined();
	expect(stripeSub1.id).not.toBe(stripeSub2.id);

	// 2. Fetch sync proposals — should see both subscriptions
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const proposal1 = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSub1.id,
	);
	const proposal2 = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSub2.id,
	);
	expect(proposal1).toBeDefined();
	expect(proposal2).toBeDefined();

	// 3. Execute sync — each subscription maps to its own plan
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSub1.id,
				plan_id: pro.id,
			},
			{
				stripe_subscription_id: stripeSub2.id,
				plan_id: premium.id,
			},
		],
	});

	expect(syncResult.results).toBeDefined();
	expect(syncResult.results.length).toBe(2);

	// 4. Verify both products are active
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: premium.id });

	// 5. Clean up
	await Promise.all([
		ctx.stripeCli.subscriptions.cancel(stripeSub1.id),
		ctx.stripeCli.subscriptions.cancel(stripeSub2.id),
	]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST E: Sync after advancing test clock by 2 weeks (reset anchoring)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: sync after advancing test clock 2 weeks")}`, async () => {
	const customerId = "sync-basic-clock-advance";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	expect(testClockId).toBeDefined();

	// 1. Create a Stripe subscription (automatically on the test clock)
	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.status).toBe("active");

	// 2. Advance test clock by 2 weeks
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
		waitForSeconds: 15,
	});

	// 3. Fetch sync proposals — subscription should still be active
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.stripe_subscription_status).toBe("active");

	// 4. Execute sync
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
			},
		],
	});

	expect(syncResult.results).toBeDefined();
	expect(syncResult.results[0].success).toBe(true);

	// 5. Verify customer has Pro active with correct features
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST F: Sync a trialing Stripe subscription (trial_ends_at alignment)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: sync trialing Stripe subscription")}`, async () => {
	const customerId = "sync-basic-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	expect(testClockId).toBeDefined();

	// 1. Get the Stripe customer ID and price IDs for manual sub creation with trial
	const [fullCustomer, fullProduct] = await Promise.all([
		CusService.getFull({ ctx, idOrInternalId: customerId }),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);

	const stripeCustomerId = fullCustomer.processor!.id!;
	const stripePriceIds = getAllStripePriceIds({ fullProduct });

	// 2. Create a Stripe subscription with a 14-day trial
	const trialDays = 14;
	const trialParams: Stripe.SubscriptionCreateParams = {
		customer: stripeCustomerId,
		items: stripePriceIds.map((priceId) => ({ price: priceId })),
		trial_period_days: trialDays,
	};
	const stripeSubscription =
		await ctx.stripeCli.subscriptions.create(trialParams);
	expect(stripeSubscription.status).toBe("trialing");
	expect(stripeSubscription.trial_end).toBeDefined();

	const trialEndMs = stripeSubscription.trial_end! * 1000;

	// 3. Advance test clock by 3 days (subscription should still be trialing)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
		waitForSeconds: 15,
	});

	// 4. Fetch sync proposals
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.stripe_subscription_status).toBe("trialing");

	// 5. Execute sync
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
			},
		],
	});

	expect(syncResult.results[0].success).toBe(true);

	// 6. Verify customer product is trialing with correct trial_ends_at
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: trialEndMs,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST G: Stripe subscription with an ad-hoc inline price (no Autumn match)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("sync-basic: Stripe sub with inline ad-hoc price")}`, async () => {
	const customerId = "sync-basic-adhoc-price";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Get the Stripe customer ID
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor!.id!;

	// 2. Create a Stripe subscription with an inline price (no matching Autumn product)
	const adHocProduct = await ctx.stripeCli.products.create({
		name: "Ad-Hoc Service",
	});
	const adHocParams: Stripe.SubscriptionCreateParams = {
		customer: stripeCustomerId,
		items: [
			{
				price_data: {
					currency: "usd",
					unit_amount: 4999,
					recurring: { interval: "month" },
					product: adHocProduct.id,
				},
			},
		],
	};
	const stripeSubscription =
		await ctx.stripeCli.subscriptions.create(adHocParams);
	expect(stripeSubscription.status).toBe("active");

	// 3. Fetch sync proposals — should list the subscription with price metadata
	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.items.length).toBe(1);

	const item = matchedProposal!.items[0];

	// Price metadata should be populated even without an Autumn match
	expect(item.unit_amount).toBe(4999);
	expect(item.currency).toBe("usd");
	expect(item.billing_scheme).toBe("per_unit");
	expect(item.stripe_product_name).toBe("Ad-Hoc Service");

	// No Autumn match expected
	expect(item.matched_plan_id).toBeNull();
	expect(item.match_method).toBeNull();

	// 4. Sync it to Pro anyway (user manually picks a plan)
	const syncResult = await autumnV1.post("/billing.sync", {
		customer_id: customerId,
		mappings: [
			{
				stripe_subscription_id: stripeSubscription.id,
				plan_id: pro.id,
			},
		],
	});

	expect(syncResult.results[0].success).toBe(true);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	// 5. Clean up
	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});
