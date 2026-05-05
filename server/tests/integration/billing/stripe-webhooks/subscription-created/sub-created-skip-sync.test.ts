import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import ctx, {
	type TestContext,
} from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { AUTUMN_STRIPE_METADATA_KEYS } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";
import { CusService } from "@/internal/customers/CusService";

const ALL_CUS_PRODUCT_STATUSES = Object.values(CusProductStatus);

const expectNoSyncCreatedExpiredProducts = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_CUS_PRODUCT_STATUSES,
	});
	const expiredProducts = fullCustomer.customer_products.filter(
		(product) => product.status === CusProductStatus.Expired,
	);
	expect(expiredProducts).toEqual([]);
};

const getLatestStripeSubscription = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}): Promise<Stripe.Subscription> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId) {
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	}
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		limit: 1,
	});
	const stripeSubscription = subscriptions.data[0];
	if (!stripeSubscription) {
		throw new Error(`Customer ${customerId} has no Stripe subscriptions`);
	}
	return stripeSubscription;
};

test(`${chalk.yellowBright("sub.created skip-sync: Autumn checkout flow attach is skipped")}`, async () => {
	const customerId = "sub-created-skip-sync-checkout";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		ctx,
		setup: [s.customer({ testClock: true }), s.products({ list: [pro] })],
		actions: [],
	});

	const attachResult = await autumnV1.billing.attach(
		{ customer_id: customerId, product_id: pro.id },
		{ timeout: 0 },
	);
	expect(attachResult.payment_url).toContain("checkout.stripe.com");

	await completeStripeCheckoutFormV2({ url: attachResult.payment_url! });
	await timeout(12000);

	const stripeSubscription = await getLatestStripeSubscription({
		ctx,
		customerId,
	});
	expect(
		stripeSubscription.metadata[AUTUMN_STRIPE_METADATA_KEYS.managedAt],
	).toBeDefined();

	await expectNoSyncCreatedExpiredProducts({ ctx, customerId });

	await expectStripeSubscriptionCorrect({
		ctx,
		customerId,
	});
});

test(`${chalk.yellowBright("sub.created skip-sync: direct attach with payment method is skipped")}`, async () => {
	const customerId = "sub-created-skip-sync-direct";

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
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const stripeSubscription = await getLatestStripeSubscription({
		ctx,
		customerId,
	});
	expect(
		stripeSubscription.metadata[AUTUMN_STRIPE_METADATA_KEYS.managedAt],
	).toBeDefined();

	await timeout(10000);

	await expectNoSyncCreatedExpiredProducts({ ctx, customerId });
});
