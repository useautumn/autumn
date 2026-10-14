import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import { expectStripeSubscriptionCorrect } from "../utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "./utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
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

const firstStripePriceIdFor = async ({
	ctx,
	productId,
}: {
	ctx: TestContext;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	for (const price of fullProduct.prices) {
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) return id;
	}
	throw new Error(`No Stripe price id on product ${productId}`);
};

test.concurrent(`${chalk.yellowBright("restore-basic 1: two entities pro+premium, corrupt one, restore")}`, async () => {
	const customerId = "restore-basic-two-entities";

	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({
				productId: premium.id,
				entityIndex: 1,
				timeout: 4000,
			}),
		],
	});
	expect(entities.length).toBe(2);

	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
	const subs = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });
	const proStripePriceId = await firstStripePriceIdFor({
		ctx,
		productId: pro.id,
	});

	const proSub = subs.find((sub) =>
		sub.items.data.some((it) => it.price.id === proStripePriceId),
	);
	if (!proSub) throw new Error("Pro sub not found in Stripe");

	await corruptStripeSubscription({
		ctx,
		subscriptionId: proSub.id,
		mutations: {
			setItemQuantities: [{ priceId: proStripePriceId, quantity: 7 }],
		},
	});

	await autumnV2_2.billing.restore({ customer_id: customerId });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("restore-basic 2: scheduled downgrade, schedule released externally, restore recreates")}`, async () => {
	const customerId = "restore-basic-released-schedule";

	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({ id: "premium", items: [premiumMessages] });

	const { autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: premium.id, entityIndex: 1 }),
			s.billing.attach({
				productId: pro.id,
				entityIndex: 1,
				timeout: 4000,
			}),
		],
	});
	expect(entities.length).toBe(2);

	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
	const subs = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });

	const premiumStripePriceId = await firstStripePriceIdFor({
		ctx,
		productId: premium.id,
	});
	const premiumSub = subs.find((sub) =>
		sub.items.data.some((it) => it.price.id === premiumStripePriceId),
	);
	if (!premiumSub) throw new Error("Premium sub not found");

	await corruptStripeSubscription({
		ctx,
		subscriptionId: premiumSub.id,
		mutations: { releaseSchedule: true },
	});

	await autumnV2_2.billing.restore({ customer_id: customerId });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
