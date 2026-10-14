import { expect, test } from "bun:test";
import {
	createExternalStripeSubscription,
	expectActiveLinkedCustomerProducts,
	getFullProduct,
	waitForCustomerProducts,
} from "@tests/integration/billing/stripe-webhooks/utils/sharedStripeProductAutoSyncUtils";
import { getBaseStripePriceId } from "@tests/integration/billing/sync/utils/syncProductHelpers";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";

const addonStripeProductId = async ({
	productId,
}: {
	productId: string;
}): Promise<string> => {
	const fullProduct = await getFullProduct({ ctx, productId });
	const stripeProductId = fullProduct.processor?.id;
	if (!stripeProductId) {
		throw new Error(`Product ${productId} has no mapped Stripe product`);
	}
	return stripeProductId;
};

const createNativePerUnitPrice = async ({
	stripeProductId,
	unitAmount,
}: {
	stripeProductId: string;
	unitAmount: number;
}): Promise<Stripe.Price> =>
	ctx.stripeCli.prices.create({
		product: stripeProductId,
		currency: "usd",
		unit_amount: unitAmount,
		recurring: { interval: "month" },
	});

const createNativeTwoTierPrice = async ({
	stripeProductId,
	freeUnits,
	unitAmount,
}: {
	stripeProductId: string;
	freeUnits: number;
	unitAmount: number;
}): Promise<Stripe.Price> =>
	ctx.stripeCli.prices.create({
		product: stripeProductId,
		currency: "usd",
		billing_scheme: "tiered",
		tiers_mode: "graduated",
		recurring: { interval: "month" },
		tiers: [
			{ up_to: freeUnits, unit_amount: 0 },
			{ up_to: "inf", unit_amount: unitAmount },
		],
	});

test(`${chalk.yellowBright("sub.created prepaid add-on: main plan + $30 prepaid item qty 2")}`, async () => {
	const customerId = "sub-created-prepaid-addon-1";

	const pro = products.pro({
		id: "prepaid-addon-1-pro",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});
	const addon = products.base({
		id: "prepaid-addon-1-ip",
		isAddOn: true,
		items: [items.prepaidMessages({ billingUnits: 1, price: 30 })],
	});

	const v1CustomerId = `${customerId}-v1`;
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: v1CustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id, customerId: v1CustomerId }),
			s.attach({
				productId: addon.id,
				customerId: v1CustomerId,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	const proFull = await getFullProduct({ ctx, productId: pro.id });
	const nativePrice = await createNativePerUnitPrice({
		stripeProductId: await addonStripeProductId({ productId: addon.id }),
		unitAmount: 3000,
	});

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: getBaseStripePriceId({ fullProduct: proFull }) },
			{ price: nativePrice.id, quantity: 2 },
		],
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [pro.id, addon.id],
	});
	const linked = await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 2,
		balance: 2,
		usage: 0,
	});

	const addonCusProduct = linked.find((cp) => cp.product_id === addon.id);
	const messagesOption = addonCusProduct?.options?.find(
		(option) => option.feature_id === TestFeature.Messages,
	);
	expect(messagesOption?.quantity).toBe(2);
});

// Skipped: snapshot tier enrichment is disabled in detectSubscriptionMatch
// (bulk-import cost), so two-tier prices cannot shape-match from webhooks.
test.skip(`${chalk.yellowBright("sub.created prepaid add-on: two-tier (1 free, $10 after) qty 2")}`, async () => {
	const customerId = "sub-created-prepaid-addon-2";

	const pro = products.pro({
		id: "prepaid-addon-2-pro",
		items: [items.monthlyUsers({ includedUsage: 5 })],
	});
	const addon = products.base({
		id: "prepaid-addon-2-ip",
		isAddOn: true,
		items: [
			items.prepaidMessages({ includedUsage: 1, billingUnits: 1, price: 10 }),
		],
	});

	const v1CustomerId = `${customerId}-v1`;
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: v1CustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id, customerId: v1CustomerId }),
			s.attach({
				productId: addon.id,
				customerId: v1CustomerId,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	const proFull = await getFullProduct({ ctx, productId: pro.id });
	const nativePrice = await createNativeTwoTierPrice({
		stripeProductId: await addonStripeProductId({ productId: addon.id }),
		freeUnits: 1,
		unitAmount: 1000,
	});

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [
			{ price: getBaseStripePriceId({ fullProduct: proFull }) },
			{ price: nativePrice.id, quantity: 2 },
		],
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [pro.id, addon.id],
	});
	const linked = await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [pro.id, addon.id],
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 2,
		balance: 2,
		usage: 0,
	});

	const addonCusProduct = linked.find((cp) => cp.product_id === addon.id);
	const messagesOption = addonCusProduct?.options?.find(
		(option) => option.feature_id === TestFeature.Messages,
	);
	expect(messagesOption?.quantity).toBe(1);
});

test(`${chalk.yellowBright("sub.created prepaid add-on: add-on-only subscription")}`, async () => {
	const customerId = "sub-created-prepaid-addon-3";

	const addon = products.base({
		id: "prepaid-addon-3-ip",
		isAddOn: true,
		items: [items.prepaidMessages({ billingUnits: 1, price: 30 })],
	});

	const v1CustomerId = `${customerId}-v1`;
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: v1CustomerId, paymentMethod: "success" }]),
			s.products({ list: [addon] }),
		],
		actions: [
			s.attach({
				productId: addon.id,
				customerId: v1CustomerId,
				options: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			}),
		],
	});

	const nativePrice = await createNativePerUnitPrice({
		stripeProductId: await addonStripeProductId({ productId: addon.id }),
		unitAmount: 3000,
	});

	const subscription = await createExternalStripeSubscription({
		ctx,
		customerId,
		items: [{ price: nativePrice.id, quantity: 1 }],
	});

	const customer = await waitForCustomerProducts({
		autumnV1,
		customerId,
		active: [addon.id],
	});
	await expectActiveLinkedCustomerProducts({
		ctx,
		stripeSubscriptionId: subscription.id,
		productIds: [addon.id],
	});
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 1,
		balance: 1,
		usage: 0,
	});
});
