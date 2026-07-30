/**
 * Billing Verify: Unlinked Prices (inline rendering)
 *
 * Contract under test (billingActions.verify):
 *   New behaviors:
 *     - A prepaid price with no stripe_prepaid_price_v2_id no longer fails the
 *       whole sub with expected_state_error: verify renders it as an inline
 *       price. The live item (valid metadata) matches and equal totals ->
 *       "correct" in BOTH non-strict and strict.
 *     - A fixed price with no stripe_price_id is rendered inline the same way;
 *       the attach-stamped item matches -> "correct".
 *     - Fixed price unlinked AND the actual item swapped to an unmarked
 *       same-amount clone -> non-strict matches by totals -> "correct";
 *       strict -> base_price_mismatch missing + item_mismatch unexpected.
 *     - Prepaid unlinked AND the actual item swapped to an inline-style item
 *       with STALE Autumn metadata but the same total -> non-strict "correct";
 *       strict -> mismatched.
 *     - Prepaid unlinked with a drifted quantity (total $ differs) -> still
 *       mismatched non-strict (totals comparison, not swallowed).
 *   Side effects: none — verify stays read-only.
 *
 * Pre-impl red: spec builders throw on missing Stripe ids, so every verify
 * below reports expected_state_error. Post-impl green once verify renders
 * id-less fixed/prepaid prices inline and matches/compares on totals.
 */

import { expect, test } from "bun:test";
import {
	findPriceByFeatureId,
	type Price,
	prices as pricesTable,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
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

/** Nulls the given Stripe id slots on a product's price config — simulates a
 * price that was never materialized in Stripe. Returns the old Stripe ids. */
const clearPriceStripeIds = async ({
	ctx,
	productId,
	featureId,
	slots,
}: {
	ctx: TestContext;
	productId: string;
	featureId?: string;
	slots: string[];
}): Promise<string[]> => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const price = featureId
		? findPriceByFeatureId({ prices: fullProduct.prices, featureId })
		: fullProduct.prices.find((candidate) => !candidate.config.feature_id);
	if (!price) throw new Error(`No matching price on product ${productId}`);

	const config = { ...(price.config as unknown as Record<string, unknown>) };
	const clearedIds: string[] = [];
	for (const slot of slots) {
		if (typeof config[slot] === "string") clearedIds.push(config[slot]);
		config[slot] = null;
	}
	await ctx.db
		.update(pricesTable)
		.set({ config: config as Price["config"] })
		.where(eq(pricesTable.id, price.id));
	return clearedIds;
};

/** Clones a live sub item's price into a fresh Stripe price Autumn has never
 * stored — optionally at a different amount. */
const createUnlinkedClone = async ({
	ctx,
	item,
	unitAmountDecimal,
}: {
	ctx: TestContext;
	item: Stripe.SubscriptionItem;
	unitAmountDecimal?: string;
}) =>
	ctx.stripeCli.prices.create({
		product: item.price.product as string,
		currency: item.price.currency,
		unit_amount_decimal:
			unitAmountDecimal ??
			item.price.unit_amount_decimal ??
			`${item.price.unit_amount}`,
		recurring: {
			interval: item.price.recurring?.interval ?? "month",
			interval_count: item.price.recurring?.interval_count ?? 1,
		},
		nickname: "unlinked-clone",
	});

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-prices 1: prepaid without v2 id renders inline -> correct, both modes")}`,
	async () => {
		const customerId = "verify-unlinked-prepaid";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		await clearPriceStripeIds({
			ctx,
			productId: pro.id,
			featureId: TestFeature.Messages,
			slots: [
				"stripe_price_id",
				"stripe_empty_price_id",
				"stripe_prepaid_price_v2_id",
			],
		});

		// ── Contract: no expected_state_error; live item matches by metadata,
		// totals equal -> correct (non-strict AND strict) ──────────────────
		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions.length).toBe(1);
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].mismatches).toEqual([]);
		expect(strict.subscriptions[0].status).toBe("correct");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-prices 2: fixed without stripe_price_id renders inline -> correct")}`,
	async () => {
		const customerId = "verify-unlinked-fixed";

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

		await clearPriceStripeIds({
			ctx,
			productId: pro.id,
			slots: ["stripe_price_id", "stripe_empty_price_id"],
		});

		// ── Contract: attach-stamped base item matches the inline render ──
		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].mismatches).toEqual([]);
		expect(result.subscriptions[0].status).toBe("correct");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-prices 3: fixed unlinked + unmarked same-amount item -> totals match non-strict, strict reports")}`,
	async () => {
		const customerId = "verify-unlinked-fixed-swap";

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

		const [oldBasePriceId] = await clearPriceStripeIds({
			ctx,
			productId: pro.id,
			slots: ["stripe_price_id"],
		});
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const baseItem = sub.items.data.find(
			(item) => item.price.id === oldBasePriceId,
		);
		if (!baseItem) throw new Error("Expected the base item on the sub");

		const clone = await createUnlinkedClone({ ctx, item: baseItem });
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [oldBasePriceId],
				addItems: [{ price: clone.id, quantity: 1 }],
			},
		});

		// ── Contract: totals-based match for the inline render, non-strict ─
		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		// ── Contract: strict keeps identity semantics ─────────────────────
		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
		expect(strict.subscriptions[0].mismatches).toMatchObject([
			{ type: "base_price_mismatch", reason: "missing" },
			{ type: "item_mismatch", reason: "unexpected" },
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-prices 4: prepaid unlinked + stale-tagged inline item at same total -> correct non-strict")}`,
	async () => {
		const customerId = "verify-unlinked-prepaid-stale";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const clearedIds = await clearPriceStripeIds({
			ctx,
			productId: pro.id,
			featureId: TestFeature.Messages,
			slots: [
				"stripe_price_id",
				"stripe_empty_price_id",
				"stripe_prepaid_price_v2_id",
			],
		});
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const prepaidSubItem = sub.items.data.find((item) =>
			clearedIds.includes(item.price.id),
		);
		if (!prepaidSubItem) throw new Error("Expected the prepaid item");

		// 300 units × $10/100u = $30 — one inline-style item at the same total,
		// tagged with a cus price that no longer exists (migration leftover).
		const staleClone = await createUnlinkedClone({
			ctx,
			item: prepaidSubItem,
			unitAmountDecimal: "3000",
		});
		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				removeItemPriceIds: [prepaidSubItem.price.id],
				addItems: [
					{
						price: staleClone.id,
						quantity: 1,
						metadata: {
							autumn_customer_price_id: "cus_price_gone",
							autumn_price_id: "pr_gone",
							inline_price: "true",
						},
					},
				],
			},
		});

		// ── Contract: stale tag doesn't block the totals match ────────────
		const lenient = await verify({ ctx, params: { customer_id: customerId } });
		expect(lenient.subscriptions[0].mismatches).toEqual([]);
		expect(lenient.subscriptions[0].status).toBe("correct");

		// ── Contract: strict keeps identity semantics ─────────────────────
		const strict = await verify({
			ctx,
			params: { customer_id: customerId, strict: true },
		});
		expect(strict.subscriptions[0].status).toBe("mismatched");
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify unlinked-prices 5: prepaid unlinked with drifted total -> still mismatched non-strict")}`,
	async () => {
		const customerId = "verify-unlinked-prepaid-drift";

		const prepaidItem = items.prepaidMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});
		const pro = products.pro({ id: "pro", items: [prepaidItem] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
			],
		});

		const clearedIds = await clearPriceStripeIds({
			ctx,
			productId: pro.id,
			featureId: TestFeature.Messages,
			slots: [
				"stripe_price_id",
				"stripe_empty_price_id",
				"stripe_prepaid_price_v2_id",
			],
		});
		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		const prepaidSubItem = sub.items.data.find((item) =>
			clearedIds.includes(item.price.id),
		);
		if (!prepaidSubItem) throw new Error("Expected the prepaid item");

		await corruptStripeSubscription({
			ctx,
			subscriptionId: sub.id,
			mutations: {
				setItemQuantities: [
					{
						priceId: prepaidSubItem.price.id,
						quantity: (prepaidSubItem.quantity ?? 1) + 100,
					},
				],
			},
		});

		// ── Contract: totals comparison catches real $ drift ──────────────
		const result = await verify({ ctx, params: { customer_id: customerId } });
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(
			result.subscriptions[0].mismatches.some(
				(mismatch) =>
					mismatch.type === "prepaid_price_mismatch" ||
					mismatch.type === "prepaid_quantity_mismatch",
			),
		).toBe(true);
	},
);
