/**
 * Billing Verify: Item Mismatches
 *
 * Contract under test (billingActions.verify):
 *   New behaviors:
 *     - Removing a fixed base-price Stripe item (drift) -> mismatch
 *       { type: "base_price_mismatch", reason: "missing" }.
 *     - Removing a plain (non-prepaid) usage item -> mismatch
 *       { type: "item_mismatch", reason: "missing" }.
 *     - Adding an unrelated Stripe item Autumn doesn't expect -> mismatch
 *       { type: "item_mismatch", reason: "unexpected" }.
 */

import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { ProductService } from "@/internal/products/ProductService";
import {
	corruptStripeSubscription,
	listActiveStripeSubscriptions,
} from "../restore/utils/corruptStripeSubscription";

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
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	return stripeCustomerId;
};

/** Finds the fixed base (non-feature) recurring price's Stripe id for a product. */
const basePriceIdFor = async ({
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
		if (price.config.feature_id) continue;
		const id =
			price.config.stripe_price_id ?? price.config.stripe_empty_price_id;
		if (id) return id;
	}
	throw new Error(`No base Stripe price id on product ${productId}`);
};

/** Finds a feature-linked price's Stripe id for a product (first match). */
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

test.concurrent(
	`${chalk.yellowBright("billing-verify item-mismatches 1: base price item removed -> base_price_mismatch missing")}`,
	async () => {
		const customerId = "verify-item-mismatch-base-price";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { removeItemPriceIds: [basePriceId] },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "base_price_mismatch",
				reason: "missing",
				expected_amount: undefined,
				actual_amount: undefined,
				phase_starts_at: undefined,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify item-mismatches 2: usage item removed -> item_mismatch missing")}`,
	async () => {
		const customerId = "verify-item-mismatch-missing";

		const messagesItem = items.consumableMessages({ includedUsage: 200 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const basePriceId = await basePriceIdFor({ ctx, productId: pro.id });
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		const messagesPriceItem = sub.items.data.find(
			(item) => item.price.id !== basePriceId,
		);
		if (!messagesPriceItem)
			throw new Error("Expected a second (messages) item on sub");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { removeItemPriceIds: [messagesPriceItem.price.id] },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "item_mismatch",
				reason: "missing",
				feature_id: "messages",
				expected_quantity: expect.any(Number),
				actual_quantity: undefined,
				phase_starts_at: undefined,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify item-mismatches 3: unexpected Stripe item -> item_mismatch unexpected")}`,
	async () => {
		const customerId = "verify-item-mismatch-unexpected";

		const pro = products.pro({
			id: "pro",
			items: [items.consumableMessages({ includedUsage: 200 })],
		});
		const addon = products.recurringAddOn({
			id: "addon-not-attached",
			items: [],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const addonPriceId = await firstStripePriceIdFor({
			ctx,
			productId: addon.id,
		});
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: { addItems: [{ price: addonPriceId, quantity: 1 }] },
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toEqual([
			{
				type: "item_mismatch",
				reason: "unexpected",
				feature_id: undefined,
				expected_quantity: undefined,
				actual_quantity: expect.any(Number),
				phase_starts_at: undefined,
			},
		]);
	},
);
