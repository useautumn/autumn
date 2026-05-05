import { expect, test } from "bun:test";
import { type ApiCustomerV3, AppEnv, type FullCustomer } from "@autumn/shared";
import {
	createStripeSubscriptionFromProduct,
	createStripeSubscriptionFromProducts,
	getFirstStripePriceId,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { handleStripeSubscriptionCreated } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionCreated/handleStripeSubscriptionCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";

const makeFullCustomer = ({
	subscriptionIds = [],
}: {
	subscriptionIds?: string[];
} = {}): FullCustomer =>
	({
		id: "customer_external_id",
		internal_id: "customer_internal_id",
		customer_products:
			subscriptionIds.length > 0
				? [{ id: "customer_product_id", subscription_ids: subscriptionIds }]
				: [],
	}) as FullCustomer;

const makeGuardrailContext = ({
	fullCustomer,
	orgId = "org_123",
	orgSlug = "org-slug",
	subscriptionId = "sub_stripe_external",
}: {
	fullCustomer?: FullCustomer;
	orgId?: string;
	orgSlug?: string;
	subscriptionId?: string;
}): {
	ctx: StripeWebhookContext;
	retrieveCalls: string[];
} => {
	const retrieveCalls: string[] = [];

	return {
		retrieveCalls,
		ctx: {
			db: "db",
			org: { id: orgId, slug: orgSlug },
			env: AppEnv.Sandbox,
			fullCustomer,
			logger: {
				error: () => undefined,
				info: () => undefined,
				warn: () => undefined,
			},
			stripeCli: {
				subscriptions: {
					retrieve: async (stripeId: string) => {
						retrieveCalls.push(stripeId);
						throw new Error("Stripe retrieve should not be called");
					},
				},
			},
			stripeEvent: {
				type: "customer.subscription.created",
				data: {
					object: {
						id: subscriptionId,
						customer: "cus_stripe_external",
					},
				},
			},
		} as unknown as StripeWebhookContext,
	};
};

const withNodeEnv = async <T>(nodeEnv: string, callback: () => Promise<T>) => {
	const originalNodeEnv = process.env.NODE_ENV;
	process.env.NODE_ENV = nodeEnv;

	try {
		return await callback();
	} finally {
		if (originalNodeEnv === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = originalNodeEnv;
		}
	}
};

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

	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
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
	const { ctx, retrieveCalls } = makeGuardrailContext({});

	await handleStripeSubscriptionCreated({ ctx });

	expect(retrieveCalls).toEqual([]);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: skips already-linked subscription")}`, async () => {
	const subscriptionId = "sub_already_linked";
	const { ctx, retrieveCalls } = makeGuardrailContext({
		subscriptionId,
		fullCustomer: makeFullCustomer({ subscriptionIds: [subscriptionId] }),
	});

	await handleStripeSubscriptionCreated({ ctx });

	expect(retrieveCalls).toEqual([]);
});

test(`${chalk.yellowBright("customer.subscription.created auto-sync: production gate skips disabled org")}`, async () => {
	const { ctx, retrieveCalls } = makeGuardrailContext({
		orgId: "org_sub_created_auto_sync_disabled",
		orgSlug: "sub-created-auto-sync-disabled",
		fullCustomer: makeFullCustomer(),
	});

	await withNodeEnv("production", async () => {
		await handleStripeSubscriptionCreated({ ctx });
	});

	expect(retrieveCalls).toEqual([]);
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

test(`${chalk.yellowBright("customer.subscription.created auto-sync: links product after external Stripe checkout completion")}`, async () => {
	const customerId = "sub-created-auto-sync-external-checkout";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const stripePriceId = getFirstStripePriceId({ fullProduct });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}

	const checkoutSession = await ctx.stripeCli.checkout.sessions.create({
		customer: stripeCustomerId,
		mode: "subscription",
		line_items: [{ price: stripePriceId, quantity: 1 }],
		success_url: "https://example.com/success",
	});
	expect(checkoutSession.url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: checkoutSession.url! });
	await timeout(12000);

	const completedSession = await ctx.stripeCli.checkout.sessions.retrieve(
		checkoutSession.id,
	);
	const subscriptionId =
		typeof completedSession.subscription === "string"
			? completedSession.subscription
			: completedSession.subscription?.id;
	if (!subscriptionId) {
		throw new Error("Checkout session did not produce a subscription");
	}
	const stripeSubscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	const linkedCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const customerProduct = linkedCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	expect(customerProduct?.subscription_ids).toContain(stripeSubscription.id);
});

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
