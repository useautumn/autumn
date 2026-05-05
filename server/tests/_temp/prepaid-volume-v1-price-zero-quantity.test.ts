/**
 * TDD repro for Mintlify billing.update selecting the old V1 prepaid Stripe price.
 *
 * Red-failure mode:
 *  - billing.update emits the stored V1 flat-tier price with quantity 0.
 *
 * Green-success criteria:
 *  - billing.update keeps the entity-scoped prepaid item on the V2 inline price path.
 */

import { expect, test } from "bun:test";
import {
	BillingVersion,
	type UpdateSubscriptionV1ParamsInput,
	type UsagePriceConfig,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

const INCLUDED_USAGE = 250;
const BILLING_UNITS = 1;
const MINTLIFY_VOLUME_TIERS = [
	{ to: 500, amount: 0, flat_amount: 125 },
	{ to: 1250, amount: 0, flat_amount: 300 },
	{ to: 2750, amount: 0, flat_amount: 633 },
	{ to: 4750, amount: 0, flat_amount: 1045 },
	{ to: 7250, amount: 0, flat_amount: 1523 },
	{ to: 9750, amount: 0, flat_amount: 1950 },
	{ to: 14750, amount: 0, flat_amount: 2802 },
	{ to: 19750, amount: 0, flat_amount: 3555 },
	{ to: 24750, amount: 0, flat_amount: 4207 },
	{ to: 34750, amount: 0, flat_amount: 5560 },
	{ to: 49750, amount: 0, flat_amount: 7462 },
	{ to: "inf" as const, amount: 0, flat_amount: 10465 },
];

type StripeSubscriptionItemSummary = {
	id: string;
	priceId: string;
	quantity: number | undefined;
	inlinePrice: string | undefined;
	autumnPriceId: string | undefined;
};

const summarizeSubscriptionItems = (
	subscription: Stripe.Subscription,
): StripeSubscriptionItemSummary[] =>
	subscription.items.data.map((item) => ({
		id: item.id,
		priceId: item.price.id,
		quantity: item.quantity ?? undefined,
		inlinePrice: item.metadata?.inline_price,
		autumnPriceId: item.metadata?.autumn_price_id,
	}));

const getLatestStripeSubscription = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	stripeCustomerId: string;
}) => {
	const subscriptions = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
		limit: 5,
	});

	const subscription = subscriptions.data.find(
		(sub) => sub.status !== "canceled",
	);
	expect(subscription).toBeDefined();

	return subscription!;
};

test(`${chalk.yellowBright("prepaid volume: billing.update does not swap entity-scoped V2 inline price for V1 quantity 0 price")}`, async () => {
	const customerId = "temp-prepaid-volume-v1-price-zero-quantity";

	const plan = products.base({
		id: "mintlify-prepaid-volume",
		items: [
			items.volumePrepaidMessages({
				includedUsage: INCLUDED_USAGE,
				billingUnits: BILLING_UNITS,
				tiers: MINTLIFY_VOLUME_TIERS,
			}),
		],
	});

	const { autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [plan] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: plan.id,
				entityIndex: 0,
				options: [
					{ feature_id: TestFeature.Messages, quantity: INCLUDED_USAGE },
				],
			}),
		],
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const cusProduct = fullCustomer.customer_products[0]!;
	const prepaidCustomerPrice = cusProduct.customer_prices.find(
		(cusPrice) => cusPrice.price.config.feature_id === TestFeature.Messages,
	);
	expect(prepaidCustomerPrice).toBeDefined();

	const prepaidConfig = prepaidCustomerPrice!.price.config as UsagePriceConfig;
	const v1StripePriceId = prepaidConfig.stripe_price_id;
	expect(v1StripePriceId).toBeDefined();

	const stripeCustomerId =
		fullCustomer.processor?.id ?? fullCustomer.processor?.processor_id;
	expect(stripeCustomerId).toBeDefined();

	const subscriptionBefore = await getLatestStripeSubscription({
		ctx,
		stripeCustomerId: stripeCustomerId!,
	});
	const itemsBefore = summarizeSubscriptionItems(subscriptionBefore);
	console.log("stripe subscription items before billing.update", itemsBefore);

	expect(
		itemsBefore.some(
			(item) => item.inlinePrice === "true" && item.priceId !== v1StripePriceId,
		),
	).toBe(true);

	await CusProductService.update({
		ctx,
		cusProductId: cusProduct.id,
		updates: {
			billing_version: BillingVersion.V1,
		},
	});

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: plan.id,
		feature_quantities: [
			{ feature_id: TestFeature.Messages, quantity: INCLUDED_USAGE },
		],
		recalculate_balances: {
			enabled: true,
		},
		redirect_mode: "if_required",
	});

	const subscriptionAfter = await getLatestStripeSubscription({
		ctx,
		stripeCustomerId: stripeCustomerId!,
	});
	const itemsAfter = summarizeSubscriptionItems(subscriptionAfter);
	console.log("stripe subscription items after billing.update", itemsAfter);

	expect(
		itemsAfter.some(
			(item) => item.priceId === v1StripePriceId && item.quantity === 0,
		),
	).toBe(false);
	expect(
		itemsAfter.some(
			(item) => item.inlinePrice === "true" && item.priceId !== v1StripePriceId,
		),
	).toBe(true);
});
