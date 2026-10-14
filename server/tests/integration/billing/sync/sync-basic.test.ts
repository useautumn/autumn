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

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");

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

	const matchedItem = matchedProposal!.items.find(
		(item) => item.matched_plan_id === pro.id,
	);
	expect(matchedItem).toBeDefined();

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

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

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

	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: free.id,
	});

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.status).toBe("active");

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();

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

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	const freeProduct = (customerAfter.products ?? []).find(
		(p: { id?: string }) => p.id === free.id,
	);
	expect(freeProduct === undefined || freeProduct.status === "expired").toBe(
		true,
	);

	expectCustomerFeatureCorrect({
		customer: customerAfter,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});
});

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

	const stripeSubscription = await createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [pro.id, addon.id],
	});
	expect(stripeSubscription.id).toBeDefined();
	expect(stripeSubscription.status).toBe("active");
	expect(stripeSubscription.items.data.length).toBeGreaterThanOrEqual(2);

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.items.length).toBeGreaterThanOrEqual(2);

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: addon.id });

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});

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

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: pro.id });
	await expectProductActive({ customer, productId: premium.id });

	await Promise.all([
		ctx.stripeCli.subscriptions.cancel(stripeSub1.id),
		ctx.stripeCli.subscriptions.cancel(stripeSub2.id),
	]);
});

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

	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});
	expect(stripeSubscription.status).toBe("active");

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfWeeks: 2,
		waitForSeconds: 15,
	});

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.stripe_subscription_status).toBe("active");

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

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
		waitForSeconds: 15,
	});

	const proposalsResponse: SyncProposalsResponse = await autumnV1.post(
		"/billing.sync_proposals",
		{ customer_id: customerId },
	);

	const matchedProposal = proposalsResponse.proposals.find(
		(p: SyncProposal) => p.stripe_subscription_id === stripeSubscription.id,
	);
	expect(matchedProposal).toBeDefined();
	expect(matchedProposal!.stripe_subscription_status).toBe("trialing");

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

	await expectProductTrialing({
		customer,
		productId: pro.id,
		trialEndsAt: trialEndMs,
	});
});

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

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor!.id!;

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

	expect(item.unit_amount).toBe(4999);
	expect(item.currency).toBe("usd");
	expect(item.billing_scheme).toBe("per_unit");
	expect(item.stripe_product_name).toBe("Ad-Hoc Service");

	expect(item.matched_plan_id).toBeNull();
	expect(item.match_method).toBeNull();

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

	await ctx.stripeCli.subscriptions.cancel(stripeSubscription.id);
});
