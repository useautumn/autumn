import { expect, test } from "bun:test";
import { type ApiCustomerV3, AppEnv, type FullCustomer } from "@autumn/shared";
import {
	createStripeSubscriptionFromProduct,
	createStripeSubscriptionFromProducts,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { handleStripeSubscriptionCreated } from "@/external/stripe/webhookHandlers/handleStripeSubscriptionCreated/handleStripeSubscriptionCreated";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { timeout } from "@/utils/genUtils";
import { getStripeSandboxContext } from "./subscriptionCreatedTestUtils.js";

const testRunId = Date.now().toString(36);
const WEBHOOK_TIMEOUT_MS = 8000;

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
	metadata,
}: {
	fullCustomer?: FullCustomer;
	orgId?: string;
	orgSlug?: string;
	subscriptionId?: string;
	metadata?: Record<string, string>;
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
						...(metadata && { metadata }),
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

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: sync external Stripe sandbox sub")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-${testRunId}`;

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

	await timeout(WEBHOOK_TIMEOUT_MS);

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

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: skips unknown Autumn customer")}`, async () => {
	const { ctx, retrieveCalls } = makeGuardrailContext({});

	await handleStripeSubscriptionCreated({ ctx });

	expect(retrieveCalls).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: skips already-linked subscription")}`, async () => {
	const subscriptionId = "sub_already_linked";
	const { ctx, retrieveCalls } = makeGuardrailContext({
		subscriptionId,
		fullCustomer: makeFullCustomer({ subscriptionIds: [subscriptionId] }),
	});

	await handleStripeSubscriptionCreated({ ctx });

	expect(retrieveCalls).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: skips subs created by Autumn (autumn_managed metadata)")}`, async () => {
	const { ctx, retrieveCalls } = makeGuardrailContext({
		fullCustomer: makeFullCustomer(),
		metadata: { autumn_managed: "true" },
	});

	await handleStripeSubscriptionCreated({ ctx });

	expect(retrieveCalls).toEqual([]);
});

// Serial: mutates process.env.NODE_ENV; concurrent peers calling
// handleStripeSubscriptionCreated would observe the wrong value mid-flight.
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

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: skips Stripe sandbox sub with no product match")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-no-match-${testRunId}`;

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
		name: `Sub Created Auto Sync No Match ${testRunId}`,
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

	await timeout(WEBHOOK_TIMEOUT_MS);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: pro.id });
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: links via stripe_price_id when stripe_product_id mismatches")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-price-id-match-${testRunId}`;

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

	// Force product-id mismatch so the only viable match path is price-id.
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: fullProduct.internal_id,
		update: {
			processor: { type: "stripe", id: `prod_fake_${testRunId}` },
		},
	});

	// Sub items still carry the real stripe_price_id (and Stripe-bound product),
	// so price-id matches the Autumn price even though product-id won't match.
	const stripeSubscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});

	await timeout(WEBHOOK_TIMEOUT_MS);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withSubs: true,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(product) => product.product_id === pro.id,
	);
	expect(customerProduct?.subscription_ids).toContain(stripeSubscription.id);
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync: skips Stripe sandbox sub matching multiple products")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-multi-match-${testRunId}`;

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

	await timeout(WEBHOOK_TIMEOUT_MS);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({ customer, productId: pro.id });
	await expectProductNotPresent({ customer, productId: premium.id });
});
