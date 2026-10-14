import { expect, test } from "bun:test";
import { createStripeSubscriptionFromProduct } from "@tests/integration/billing/sync/utils/syncTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { SubService } from "@/internal/subscriptions/SubService";

test(`${chalk.yellowBright("sub-created row 1: saves subscriptions row even when auto-sync skips")}`, async () => {
	const customerId = "sub-created-subscription-row";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	await initScenario({
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
		name: "Sub Created Subscription Row No Match",
	});
	const stripeSubscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [
			{
				price_data: {
					currency: "usd",
					product: stripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 5555,
				},
			},
		],
	});

	await timeout(10000);

	const subscriptionRow = await SubService.getByStripeId({
		db: ctx.db,
		stripeId: stripeSubscription.id,
	});
	expect(subscriptionRow).toBeDefined();
	expect(subscriptionRow?.org_id).toBe(ctx.org.id);
	expect(subscriptionRow?.env).toBe(ctx.env);
	expect(subscriptionRow?.current_period_start).toBeGreaterThan(0);
	expect(subscriptionRow?.current_period_end).toBeGreaterThan(
		subscriptionRow?.current_period_start ?? 0,
	);
	expect(subscriptionRow?.billing_cycle_anchor_seconds).toBe(
		stripeSubscription.billing_cycle_anchor,
	);
});

test(`${chalk.yellowBright("sub-created row 2: no row for unknown Stripe customer")}`, async () => {
	const stripeCustomer = await ctx.stripeCli.customers.create({
		email: "sub-created-subscription-row-unknown@example.com",
	});
	const stripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Subscription Row Unknown Customer",
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

	const subscriptionRow = await SubService.getByStripeId({
		db: ctx.db,
		stripeId: stripeSubscription.id,
	});
	expect(subscriptionRow).toBeUndefined();
});

test(`${chalk.yellowBright("sub-created row 3: exactly one row when auto-sync runs")}`, async () => {
	const customerId = "sub-created-subscription-row-synced";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	await initScenario({
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

	await timeout(10000);

	const subscriptionRows = await SubService.getInStripeIds({
		db: ctx.db,
		ids: [stripeSubscription.id],
	});
	expect(subscriptionRows.length).toBe(1);
	expect(subscriptionRows[0].current_period_start).toBeGreaterThan(0);
});

test(`${chalk.yellowBright("sub-created row 4: attach-created sub keeps exactly one row")}`, async () => {
	const customerId = "sub-created-subscription-row-attach";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	await timeout(10000);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	const stripeSubscriptionId = customerProduct?.subscription_ids?.[0];
	if (!stripeSubscriptionId) {
		throw new Error(`Customer ${customerId} has no attached subscription`);
	}

	const subscriptionRows = await SubService.getInStripeIds({
		db: ctx.db,
		ids: [stripeSubscriptionId],
	});
	expect(subscriptionRows.length).toBe(1);
	expect(subscriptionRows[0].current_period_start).toBeGreaterThan(0);
	expect(subscriptionRows[0].current_period_end).toBeGreaterThan(
		subscriptionRows[0].current_period_start ?? 0,
	);
});
