import { test } from "bun:test";
import type { ApiCustomerV3, FullProduct, Price } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { timeout } from "@/utils/genUtils";
import { getStripeSandboxContext } from "./subscriptionCreatedTestUtils.js";

const testRunId = Date.now().toString(36);
const WEBHOOK_TIMEOUT_MS = 8000;

const getFullProduct = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getFeaturePrice = ({
	fullProduct,
	featureId,
}: {
	fullProduct: FullProduct;
	featureId: string;
}): Price => {
	const price = fullProduct.prices.find(
		(candidatePrice) =>
			"feature_id" in candidatePrice.config &&
			candidatePrice.config.feature_id === featureId,
	);

	if (!price) {
		throw new Error(
			`Product ${fullProduct.id} has no Stripe-backed price for feature ${featureId}`,
		);
	}

	return price;
};

const getStripeSubscriptionPriceId = ({ price }: { price: Price }): string => {
	const config = price.config;
	const stripePriceId =
		("stripe_prepaid_price_v2_id" in config &&
			config.stripe_prepaid_price_v2_id) ||
		config.stripe_price_id ||
		config.stripe_empty_price_id;

	if (!stripePriceId) {
		throw new Error(`Price ${price.id} has no Stripe price ID`);
	}

	return stripePriceId;
};

const getStripeCustomerId = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<string> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}

	return stripeCustomerId;
};

const createStripeSubscription = async ({
	ctx,
	customerId,
	subscriptionItems,
}: {
	ctx: TestContext;
	customerId: string;
	subscriptionItems: Stripe.SubscriptionCreateParams.Item[];
}) => {
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: subscriptionItems,
	});
};

const waitForWebhookToProcess = () => timeout(WEBHOOK_TIMEOUT_MS);

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync paid features: imports prepaid Stripe quantity")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-prepaid-quantity-${testRunId}`;

	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
			}),
		],
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

	const fullProduct = await getFullProduct({ ctx, productId: pro.id });
	const messagesPrice = getFeaturePrice({
		fullProduct,
		featureId: TestFeature.Messages,
	});
	const messagesStripePriceId = getStripeSubscriptionPriceId({
		price: messagesPrice,
	});

	await createStripeSubscription({
		ctx,
		customerId,
		subscriptionItems: [{ price: messagesStripePriceId, quantity: 5 }],
	});

	await waitForWebhookToProcess();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 500,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync paid features: missing prepaid item initializes to zero quantity")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-missing-prepaid-${testRunId}`;

	const pro = products.pro({
		id: "pro-missing-prepaid",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
			}),
			items.prepaidUsers({
				includedUsage: 0,
				billingUnits: 1,
			}),
		],
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

	const fullProduct = await getFullProduct({ ctx, productId: pro.id });
	const messagesPrice = getFeaturePrice({
		fullProduct,
		featureId: TestFeature.Messages,
	});
	const messagesStripePriceId = getStripeSubscriptionPriceId({
		price: messagesPrice,
	});

	await createStripeSubscription({
		ctx,
		customerId,
		subscriptionItems: [{ price: messagesStripePriceId, quantity: 3 }],
	});

	await waitForWebhookToProcess();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 300,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		balance: 0,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync paid features: keeps consumable feature while seeding prepaid")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-mixed-consumable-${testRunId}`;

	const pro = products.pro({
		id: "pro-mixed-consumable",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
			}),
			items.consumableWords({ includedUsage: 0 }),
		],
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

	const fullProduct = await getFullProduct({ ctx, productId: pro.id });
	const messagesStripePriceId = getStripeSubscriptionPriceId({
		price: getFeaturePrice({
			fullProduct,
			featureId: TestFeature.Messages,
		}),
	});
	const wordsStripePriceId = getStripeSubscriptionPriceId({
		price: getFeaturePrice({
			fullProduct,
			featureId: TestFeature.Words,
		}),
	});

	await createStripeSubscription({
		ctx,
		customerId,
		subscriptionItems: [
			{ price: messagesStripePriceId, quantity: 2 },
			{ price: wordsStripePriceId },
		],
	});

	await waitForWebhookToProcess();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 200,
		usage: 0,
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync paid features: skips allocated prices cleanly")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-allocated-skip-${testRunId}`;

	const pro = products.pro({
		id: "pro-allocated-skip",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
			}),
			items.allocatedUsers({ includedUsage: 0 }),
		],
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

	const fullProduct = await getFullProduct({ ctx, productId: pro.id });
	const messagesStripePriceId = getStripeSubscriptionPriceId({
		price: getFeaturePrice({
			fullProduct,
			featureId: TestFeature.Messages,
		}),
	});

	await createStripeSubscription({
		ctx,
		customerId,
		subscriptionItems: [{ price: messagesStripePriceId, quantity: 1 }],
	});

	await waitForWebhookToProcess();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100,
		usage: 0,
	});
});

test.concurrent(`${chalk.yellowBright("customer.subscription.created auto-sync paid features: ignores extra unmapped Stripe items")}`, async () => {
	const ctx = await getStripeSandboxContext();
	const customerId = `sub-created-auto-sync-extra-stripe-item-${testRunId}`;

	const pro = products.pro({
		id: "pro-extra-stripe-item",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
			}),
		],
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

	const fullProduct = await getFullProduct({ ctx, productId: pro.id });
	const messagesStripePriceId = getStripeSubscriptionPriceId({
		price: getFeaturePrice({
			fullProduct,
			featureId: TestFeature.Messages,
		}),
	});
	const extraStripeProduct = await ctx.stripeCli.products.create({
		name: "Sub Created Auto Sync Extra Item",
	});

	await createStripeSubscription({
		ctx,
		customerId,
		subscriptionItems: [
			{ price: messagesStripePriceId, quantity: 4 },
			{
				price_data: {
					currency: "usd",
					product: extraStripeProduct.id,
					recurring: { interval: "month" },
					unit_amount: 1234,
				},
			},
		],
	});

	await waitForWebhookToProcess();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({ customer, productId: pro.id });
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 400,
		usage: 0,
	});
});
