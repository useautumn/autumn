import { expect, test } from "bun:test";
import { type ApiCustomerV3, AppEnv } from "@autumn/shared";
import {
	createStripeSubscriptionFromProduct,
	createStripeSubscriptionFromProducts,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

test(`${chalk.yellowBright("customer.subscription.created auto-sync: sync external Stripe sandbox sub")}`, async () => {
	const customerId = "sub-created-auto-sync";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
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

	await expectCustomerProducts({
		autumn: autumnV1,
		customerId,
		active: [pro.id],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	expect(customerProduct?.subscription_ids).toContain(stripeSubscription.id);
	expect(ctx.env).toBe(AppEnv.Sandbox);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: skips unknown Autumn customer")}`, async () => {
	const stripeCustomer = await ctx.stripeCli.customers.create({
		email: "sub-created-auto-sync-unknown@example.com",
	});
	const stripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Auto Sync Unknown Customer",
	});
	const stripeSubscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomer.id,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 4242,
				},
			},
		],
		payment_behavior: "default_incomplete",
	});

	await timeout(10000);

	const linkedCusProducts = await CusProductService.getByStripeSubId({
		db: ctx.db,
		stripeSubId: stripeSubscription.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(linkedCusProducts).toEqual([]);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: skips Stripe sandbox sub with no product match")}`, async () => {
	const customerId = "sub-created-auto-sync-no-match";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
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
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}

	const stripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Auto Sync No Match",
	});
	await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 9999,
				},
			},
		],
	});

	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: pro.id });
});

// A fifth case used to complete a real Stripe Checkout page in Chromium to
// prove that a sub born from a NON-Autumn checkout session still auto-syncs.
// It was inherently non-deterministic (hosted-page submit went inert under
// full-run concurrency) and Stripe has no API to complete a session, so the
// coverage was split:
//   - "sub created outside Autumn is matched, synced and linked" -> the first
//     test in this file (identical webhook path; the sub simply has no session).
//   - "a checkout session on the sub only suppresses auto-sync when it carries
//     autumn_metadata_id" -> tests/unit/billing/sync/is-autumn-checkout-subscription.spec.ts,
//     which pins both branches of isAutumnCheckoutSubscription.
//   - "Autumn's own checkout completion attaches the product exactly once" ->
//     the stripe-checkout / legacy-checkout attach suites.

test(`${chalk.yellowBright("customer.subscription.created auto-sync: skips Stripe sandbox sub matching multiple products")}`, async () => {
	const customerId = "sub-created-auto-sync-multi-match";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	await createStripeSubscriptionFromProducts({
		ctx,
		customerId,
		productIds: [pro.id, premium.id],
	});

	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: pro.id });
	await expectProductNotPresent({ customer, productId: premium.id });
});
