/**
 * TDD test for sibling-aware shared-price matching in sync detection.
 *
 * Scenario: two Autumn plans (pro, scale) both bill the same usage feature
 * through ONE shared Stripe metered price (same stripe_price_id +
 * stripe_product_id stamped on both plans' usage price configs) — the
 * Resend transactional_pro / transactional_scale "Automations" shape.
 *
 * Contract under test:
 *   New behaviors (observable via subscriptionToSyncParams):
 *     - sub = scale base item + shared metered item
 *         -> exactly ONE MatchedPlan: scale, base "matched", metered item
 *            attached as a feature; pro absent. Sync params carry one plan.
 *     - sub = pro base item + shared metered item
 *         -> exactly ONE MatchedPlan: pro(matched) with the feature
 *            (no over-correction toward the other plan).
 *     - sub = shared metered item alone (no base anywhere)
 *         -> unchanged fallback: one plan, first catalog match, base
 *            "dropped" (behavior only changes when an anchor exists).
 *   Side effects: none — detection is pure.
 *
 * Pre-impl red: the shared item resolves to the FIRST catalog product for
 * both base-anchored subs, so exactly one of case 1 / case 2 rolls up TWO
 * plans (anchored plan + phantom dropped plan) and fails.
 * Post-impl green: feature items re-match within anchored (base-matched)
 * plans before the global catalog (detect/rematchFeaturesWithinAnchoredPlans).
 */

import { expect, test } from "bun:test";
import { isUsagePrice, type UsagePriceConfig } from "@autumn/shared";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { PriceService } from "@/internal/products/prices/PriceService";
import {
	fetchFullProduct,
	getBaseStripePriceId,
	getStripeCustomerId,
} from "../utils/syncProductHelpers";

/**
 * Creates pro + scale plans sharing one Stripe metered price on their usage
 * price configs, mirroring plans that were mapped to the same Stripe product.
 */
const initSharedMeteredScenario = async ({
	customerId,
	proId,
	scaleId,
}: {
	customerId: string;
	proId: string;
	scaleId: string;
}) => {
	const pro = products.pro({
		id: proId,
		items: [items.consumableMessages({ price: 0.1 })],
	});
	const scale = products.premium({
		id: scaleId,
		items: [items.consumableMessages({ price: 0.1 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, scale] }),
		],
		actions: [],
	});

	const sharedStripeProduct = await ctx.stripeCli.products.create({
		name: `Shared Metered ${proId}`,
	});
	const meter = await ctx.stripeCli.billing.meters.create({
		display_name: `Shared metered ${proId}`,
		event_name: `shared_metered_${proId}_${Date.now()}`,
		default_aggregation: { formula: "sum" },
	});
	const sharedMeteredPrice = await ctx.stripeCli.prices.create({
		product: sharedStripeProduct.id,
		currency: "usd",
		unit_amount: 10,
		recurring: { interval: "month", usage_type: "metered", meter: meter.id },
	});

	// initScenario suffixes product ids with the customer id — use the mutated ids.
	for (const productId of [pro.id, scale.id]) {
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
				stripe_product_id: sharedStripeProduct.id,
			},
		});
	}

	return { pro, scale, sharedMeteredPrice };
};

const createSubscription = async ({
	customerId,
	stripePriceIds,
}: {
	customerId: string;
	stripePriceIds: string[];
}): Promise<Stripe.Subscription> => {
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });
	return ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: stripePriceIds.map((price) => ({ price })),
	});
};

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: scale base + shared metered item → single scale(matched) plan
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 1 — shared item follows the anchored scale plan")}`,
	async () => {
		const customerId = "shared-metered-1-scale";
		const proId = "shared-metered-1-pro";
		const scaleId = "shared-metered-1-scale-plan";

		const { scale, sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const scaleFull = await fetchFullProduct({ ctx, productId: scale.id });
		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [
				getBaseStripePriceId({ fullProduct: scaleFull }),
				sharedMeteredPrice.id,
			],
		});

		const { match, params } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		// ── Contract: exactly one plan — scale(matched); no phantom pro plan ──
		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: scale.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		});

		// ── Contract: the shared metered item is attached as a scale feature ──
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.features).toHaveLength(1);

		// ── Contract: sync params carry exactly one plan for scale ──
		expectSyncParamsCorrect({
			params,
			customer_id: customerId,
			stripe_subscription_id: subscription.id,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: scale.id, quantity: 1, customize: null }],
				},
			],
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: pro base + shared metered item → single pro(matched) plan
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 2 — shared item follows the anchored pro plan")}`,
	async () => {
		const customerId = "shared-metered-2-pro";
		const proId = "shared-metered-2-pro-plan";
		const scaleId = "shared-metered-2-scale";

		const { pro, sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const proFull = await fetchFullProduct({ ctx, productId: pro.id });
		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [
				getBaseStripePriceId({ fullProduct: proFull }),
				sharedMeteredPrice.id,
			],
		});

		const { match } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		// ── Contract: exactly one plan — pro(matched) with the feature ──
		expectSubscriptionMatchCorrect({
			match,
			currentPhase: {
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		});
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans[0]?.features).toHaveLength(1);
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: shared metered item alone → unchanged fallback (one plan, dropped base)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("shared-metered: case 3 — no anchor keeps first-catalog-match fallback")}`,
	async () => {
		const customerId = "shared-metered-3-alone";
		const proId = "shared-metered-3-pro";
		const scaleId = "shared-metered-3-scale";

		const { sharedMeteredPrice } = await initSharedMeteredScenario({
			customerId,
			proId,
			scaleId,
		});

		const subscription = await createSubscription({
			customerId,
			stripePriceIds: [sharedMeteredPrice.id],
		});

		const { match } = await subscriptionToSyncParams({
			ctx,
			customerId,
			subscription,
		});

		// ── Contract: fallback untouched — one plan, base dropped ──
		const currentPhase = match.phaseMatches.find((phase) => phase.is_current);
		expect(currentPhase?.plans).toHaveLength(1);
		expect(currentPhase?.plans[0]?.base.kind).toBe("dropped");
	},
);
