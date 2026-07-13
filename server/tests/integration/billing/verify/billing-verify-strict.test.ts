/** Contract tests for verify's strict and non-strict usage-item handling. */

import { expect, test } from "bun:test";
import { findPriceByFeatureId } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
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

/** Removes the (single) feature-linked usage item from the customer's sub. */
const removeUsageItem = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const basePrice = fullProduct.prices.find(
		(price) => !price.config.feature_id,
	);
	const basePriceId =
		basePrice?.config.stripe_price_id ??
		basePrice?.config.stripe_empty_price_id;
	if (!basePriceId)
		throw new Error(`No base Stripe price id on product ${productId}`);

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);

	const [sub] = await listActiveStripeSubscriptions({ ctx, stripeCustomerId });
	const usageItem = sub.items.data.find(
		(item) => item.price.id !== basePriceId,
	);
	if (!usageItem) throw new Error("Expected a usage item on the sub");

	await corruptStripeSubscription({
		ctx,
		subscriptionId: sub.id,
		mutations: { removeItemPriceIds: [usageItem.price.id] },
	});
};

const featurePriceIdFor = async ({
	ctx,
	productId,
	featureId,
}: {
	ctx: TestContext;
	productId: string;
	featureId: string;
}): Promise<string> => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const price = findPriceByFeatureId({
		prices: fullProduct.prices,
		featureId,
	});
	const priceId =
		price?.config.stripe_price_id ?? price?.config.stripe_empty_price_id;
	if (!priceId) {
		throw new Error(`No Stripe price for ${featureId} on product ${productId}`);
	}
	return priceId;
};

// ── A + B: same corrupted state, verdict flips on `strict` ──────────────────

test.concurrent(
	`${chalk.yellowBright("billing-verify strict: missing usage item tolerated by default, reported when strict")}`,
	async () => {
		const customerId = "verify-strict-usage-fallback";

		const messagesItem = items.consumableMessages({ includedUsage: 100 });
		const pro = products.pro({ id: "pro", items: [messagesItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		await removeUsageItem({ ctx, customerId, productId: pro.id });

		// A. Default: the monthly base item still invoices -> correct.
		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions.length).toBe(1);
		expect(lenient.subscriptions[0].status).toBe("correct");
		expect(lenient.subscriptions[0].mismatches).toEqual([]);

		// B. Strict: the same state reports the missing usage item.
		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{
				type: "item_mismatch",
				reason: "missing",
				price_type: "usage",
				feature_id: "messages",
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify strict: unexpected metered item tolerated by default, reported when strict")}`,
	async () => {
		const customerId = "verify-strict-unexpected-metered";
		const pro = products.pro({ id: "pro", items: [] });
		const meteredSource = products.pro({
			id: "metered-source",
			items: [items.consumableMessages()],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, meteredSource] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const stripeCustomerId = fullCustomer.processor?.id;
		if (!stripeCustomerId) throw new Error("Expected a Stripe customer ID");
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const meteredPriceId = await featurePriceIdFor({
			ctx,
			productId: meteredSource.id,
			featureId: TestFeature.Messages,
		});
		await ctx.stripeCli.subscriptions.update(sub.id, {
			items: [{ price: meteredPriceId }],
			proration_behavior: "none",
		});

		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].status).toBe("correct");
		expect(lenient.subscriptions[0].mismatches).toEqual([]);

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{
				type: "item_mismatch",
				reason: "unexpected",
				actual_quantity: 0,
			},
		]);
	},
);

// ── C: no item on the usage price's interval -> fallback must not apply ─────

test.concurrent(
	`${chalk.yellowBright("billing-verify strict: fallback requires an item on the same interval")}`,
	async () => {
		const customerId = "verify-strict-interval-gap";

		const pro = products.proAnnual({
			id: "pro-annual",
			items: [items.consumableMessages({ includedUsage: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		// Annual base stays; the monthly usage item is removed — no monthly
		// invoice cadence remains, so even non-strict verify must report it.
		await removeUsageItem({ ctx, customerId, productId: pro.id });

		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toMatchObject([
			{
				type: "item_mismatch",
				reason: "missing",
				price_type: "usage",
				feature_id: "messages",
			},
		]);
	},
);
