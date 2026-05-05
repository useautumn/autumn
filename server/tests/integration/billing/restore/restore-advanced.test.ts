/**
 * Restore Advanced Tests
 *
 * Test 3: Pro + recurring add-on. Remove the add-on item from Stripe, restore
 *         should put it back.
 * Test 4: Pro + prepaid messages. Set the prepaid quantity to a wrong value,
 *         restore should set it back to Autumn's expected quantity.
 */

import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
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

const allStripePriceIdsFor = async ({
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
	const ids: string[] = [];
	for (const price of fullProduct.prices) {
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) ids.push(id);
	}
	return ids;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Pro + recurring add-on, remove add-on item from Stripe, restore
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("restore-advanced 3: pro + recurring add-on, remove add-on item, restore")}`, async () => {
	const customerId = "restore-advanced-addon";

	const proMessages = items.monthlyMessages({ includedUsage: 200 });
	const pro = products.pro({ id: "pro", items: [proMessages] });

	const addonWords = items.monthlyWords({ includedUsage: 200 });
	const addOn = products.recurringAddOn({
		id: "recurring-addon",
		items: [addonWords],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addOn.id, timeout: 4000 }),
		],
	});

	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
	const subs = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });
	expect(subs.length).toBe(1);
	const sub = subs[0];

	// Remove the add-on's Stripe item from the subscription.
	const addonPriceIds = await allStripePriceIdsFor({
		ctx,
		productId: addOn.id,
	});
	await corruptStripeSubscription({
		ctx,
		subscriptionId: sub.id,
		mutations: { removeItemPriceIds: addonPriceIds },
	});

	await autumnV2_2.billing.restore({ customer_id: customerId });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Pro with prepaid messages — corrupt the prepaid quantity, restore
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("restore-advanced 4: pro + prepaid messages, wrong quantity, restore")}`, async () => {
	const customerId = "restore-advanced-prepaid";
	const billingUnits = 100;
	const includedUsage = 100;

	const prepaid = items.prepaidMessages({
		includedUsage,
		billingUnits,
		price: 10,
		config: {
			on_increase: OnIncrease.ProrateImmediately,
			on_decrease: OnDecrease.ProrateImmediately,
		},
	});
	const fixed = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [prepaid, fixed] });

	const initialPacks = 4;
	const totalUnits = includedUsage + initialPacks * billingUnits;

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: totalUnits }],
				timeout: 4000,
			}),
		],
	});

	const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
	const subs = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });
	expect(subs.length).toBe(1);
	const sub = subs[0];

	const proPriceIds = await allStripePriceIdsFor({ ctx, productId: pro.id });

	// Find the prepaid item on Stripe (one of the price ids will be on the sub
	// with quantity > 0 and not equal to the fixed-base price item). The
	// simplest corruption: set every Stripe item quantity to a wrong value.
	const wrongQuantityUpdates = sub.items.data
		.filter((item) => proPriceIds.includes(item.price.id))
		.filter((item) => item.quantity !== undefined)
		.map((item) => ({
			priceId: item.price.id,
			quantity: (item.quantity ?? 1) + 3,
		}));

	await corruptStripeSubscription({
		ctx,
		subscriptionId: sub.id,
		mutations: { setItemQuantities: wrongQuantityUpdates },
	});

	await autumnV2_2.billing.restore({ customer_id: customerId });

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
