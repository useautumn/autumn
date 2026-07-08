/**
 * Base-plan fallback for unclaimed items under a shared Stripe product.
 *
 * Scenario: a base plan and its variant (base_variant_id) are both mapped to
 * ONE Stripe product (processor.id). A sub carries a custom price under that
 * product which shape-matches neither plan — the Resend marketing_pro
 * "one-off custom price" shape.
 *
 * Contract under test:
 *   - case 1: custom base item alone -> ONE MatchedPlan: the BASE plan (not
 *     the variant), base "custom", customize.price = the actual amount, and
 *     canAutoSync eligible.
 *   - case 2: custom base item + a metered price shared with a SEPARATE plan
 *     -> the metered item groups under the fallback-anchored base plan (via
 *     rematchFeaturesWithinAnchoredPlans); no phantom second plan.
 */

import { expect, test } from "bun:test";
import {
	isUsagePrice,
	type ProductItem,
	type UsagePriceConfig,
} from "@autumn/shared";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { canAutoSync } from "@/internal/billing/v2/actions/sync/canAutoSync/index.js";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { ProductService } from "@/internal/products/ProductService";
import { PriceService } from "@/internal/products/prices/PriceService";
import {
	createStripeFixedPriceUnderProduct,
	fetchFullProduct,
	getStripeCustomerId,
} from "../utils/syncProductHelpers";

/**
 * Creates a base plan ($20/mo) + variant ($50/mo) mapped to one shared Stripe
 * product, with the variant pointing at the base via base_variant_id.
 */
const initBaseVariantScenario = async ({
	customerId,
	baseId,
	variantId,
	baseItems = [],
	extraProducts = [],
}: {
	customerId: string;
	baseId: string;
	variantId: string;
	baseItems?: ProductItem[];
	extraProducts?: ReturnType<typeof products.pro>[];
}) => {
	const basePlan = products.pro({ id: baseId, items: baseItems });
	const variantPlan = products.premium({ id: variantId, items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [basePlan, variantPlan, ...extraProducts] }),
		],
		actions: [],
	});

	const sharedStripeProduct = await ctx.stripeCli.products.create({
		name: `Base Fallback ${baseId}`,
	});

	// initScenario suffixes product ids with the customer id — use mutated ids.
	const baseFull = await fetchFullProduct({ ctx, productId: basePlan.id });
	const variantFull = await fetchFullProduct({
		ctx,
		productId: variantPlan.id,
	});

	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: baseFull.internal_id,
		update: { processor: { type: "stripe", id: sharedStripeProduct.id } },
	});
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: variantFull.internal_id,
		update: {
			processor: { type: "stripe", id: sharedStripeProduct.id },
			base_variant_id: basePlan.id,
		},
	});

	// $75/mo shape-matches neither the $20 base nor the $50 variant.
	const customStripePrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: sharedStripeProduct.id,
		unitAmount: 7500,
	});

	return { basePlan, variantPlan, customStripePrice };
};

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: custom price under shared product → base plan wins with custom base
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("base-fallback: case 1 — unclaimed custom price attaches to the base plan")}`,
	async () => {
		const customerId = "base-fallback-1";
		const { basePlan, customStripePrice } = await initBaseVariantScenario({
			customerId,
			baseId: "base-fallback-1-base",
			variantId: "base-fallback-1-variant",
		});

		const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
		const subscription = await ctx.stripeCli.subscriptions.create({
			customer: stripeCustomerId,
			items: [{ price: customStripePrice.id }],
		});

		const { match, params } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		// ── Contract: one plan — the BASE plan, custom base, no variant ──
		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: basePlan.id, base_kind: "custom" }],
				noUnmatchedItems: true,
			},
		});

		// ── Contract: customize.price carries the actual amount ──
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.customize?.price?.amount).toBe(75);

		// ── Contract: auto-sync eligible; sync params carry the custom price ──
		expect(canAutoSync({ match }).eligible).toBe(true);
		expectSyncParamsCorrect({
			params,
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: basePlan.id,
							quantity: 1,
							customize: { price: { amount: 75 } },
						},
					],
				},
			],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: custom base + metered price shared with a separate plan → one plan
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("base-fallback: case 2 — shared metered item groups under the fallback-anchored plan")}`,
	async () => {
		const customerId = "base-fallback-2";

		// A separate plan billing the same feature through the SAME Stripe
		// metered price — the shared-price shape that used to leak phantoms.
		const otherPlan = products.growth({
			id: "base-fallback-2-other",
			items: [items.consumableMessages({ price: 0.1 })],
		});
		const { basePlan, customStripePrice } = await initBaseVariantScenario({
			customerId,
			baseId: "base-fallback-2-base",
			variantId: "base-fallback-2-variant",
			baseItems: [items.consumableMessages({ price: 0.1 })],
			extraProducts: [otherPlan],
		});

		const sharedMeteredProduct = await ctx.stripeCli.products.create({
			name: `Shared Metered ${customerId}`,
		});
		const meter = await ctx.stripeCli.billing.meters.create({
			display_name: `Shared metered ${customerId}`,
			event_name: `base_fallback_${customerId}_${Date.now()}`,
			default_aggregation: { formula: "sum" },
		});
		const sharedMeteredPrice = await ctx.stripeCli.prices.create({
			product: sharedMeteredProduct.id,
			currency: "usd",
			unit_amount: 10,
			recurring: { interval: "month", usage_type: "metered", meter: meter.id },
		});

		for (const productId of [basePlan.id, otherPlan.id]) {
			const fullProduct = await fetchFullProduct({ ctx, productId });
			const usagePrice = fullProduct.prices.find((price) =>
				isUsagePrice({ price }),
			);
			if (!usagePrice) throw new Error(`${productId} has no usage price`);
			await PriceService.updateConfig({
				db: ctx.db,
				id: usagePrice.id,
				config: {
					...(usagePrice.config as UsagePriceConfig),
					stripe_price_id: sharedMeteredPrice.id,
					stripe_product_id: sharedMeteredProduct.id,
				},
			});
		}

		const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
		const subscription = await ctx.stripeCli.subscriptions.create({
			customer: stripeCustomerId,
			items: [
				{ price: customStripePrice.id },
				{ price: sharedMeteredPrice.id },
			],
		});

		const { match } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		// ── Contract: ONE plan — the base plan with the metered feature; no
		// phantom plan for the shared metered price's other owner ──
		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: basePlan.id, base_kind: "custom" }],
				noUnmatchedItems: true,
			},
		});
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.features).toHaveLength(1);
	},
);
