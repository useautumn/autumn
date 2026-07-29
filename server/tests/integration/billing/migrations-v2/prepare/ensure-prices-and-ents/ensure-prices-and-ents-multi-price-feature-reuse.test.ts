/**
 * TDD test for Stripe resource reuse when a feature has MORE THAN ONE price
 * on the base plan (e.g. AI_CREDITS carries both a prepaid tiered price and a
 * separate metered pay-as-you-go price, sharing the same `feature_id`).
 *
 * Red-failure mode (before this fix): `inheritStripeResourcesFromLatestVersion`
 * used `findPriceByFeatureId`, which does a plain `.find()` and returns
 * whichever same-feature price comes first — with no fallback if that's the
 * wrong one. When the base plan's latest version has two prices for the same
 * feature (prepaid + metered), reuse could grab the metered price as the sole
 * candidate, fail to match content against the migration's new PREPAID price,
 * and mint a brand-new Stripe price instead of reusing the real prepaid one
 * that already exists.
 *
 * Green-success criteria (after fix): all same-feature prices on the base
 * plan's latest version are passed as reuse candidates, and
 * `copyStripeResourcesToMatchingPrice`'s own content matching picks the
 * correct (prepaid) one regardless of array order.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { buildUpdatePlanOperations, createMigration } from "../../utils/migrationTestUtils.js";
import {
	expectPreparedArtifact,
	expectPreparedArtifactRowIds,
	prepareMigration,
} from "./utils/ensurePrepareTestUtils.js";

type PriceStripeConfig = {
	stripe_price_id?: string | null;
	stripe_product_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
};

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: reuse picks the right price when a feature has more than one")}`, async () => {
	const customerId = "prep-multi-price-feature-reuse";

	// Pre-seed the base plan with BOTH a metered price AND a prepaid tiered
	// price for the same feature — mirrors AI_CREDITS' real shape (prepaid
	// tiers + a separate metered overage price).
	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ price: 0.05 }),
			items.volumePrepaidMessages({
				includedUsage: 0,
				tiers: [
					{ to: 2000, amount: 30 },
					{ to: "inf", amount: 12 },
				],
			}),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro] })],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preSeededPrices = await ctx.db.query.products
		.findFirst({
			where: (p, { eq, and }) =>
				and(eq(p.id, pro.id), eq(p.org_id, ctx.org.id), eq(p.env, ctx.env)),
			with: { prices: true },
		})
		.then((product) => product?.prices ?? []);
	const preSeededPrepaid = preSeededPrices.find(
		(p) => (p.config as { type?: string }).type === "usage" && p.tier_behavior === "volume",
	);
	if (!preSeededPrepaid) {
		throw new Error("Expected pre-seeded prepaid price to exist");
	}
	const preSeededConfig = preSeededPrepaid.config as PriceStripeConfig;
	if (
		!preSeededConfig.stripe_price_id ||
		!preSeededConfig.stripe_product_id ||
		!preSeededConfig.stripe_prepaid_price_v2_id
	) {
		throw new Error("Expected pre-seeded prepaid price to have real Stripe ids");
	}

	// Migration replaces the prepaid item with the SAME shape (add_items uses
	// an identical ladder) — matched product still carries the pre-existing
	// metered price for the same feature alongside it, so the reuse candidate
	// set is genuinely ambiguous by feature_id alone.
	const operations = buildUpdatePlanOperations({
		planId: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.volumePrepaidMessages({
					included: 0,
					tiers: [
						{ to: 2000, amount: 30 },
						{ to: "inf", amount: 12 },
					],
				}),
			],
		},
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations,
	});

	const run = await prepareMigration({ ctx, migration, dryRun: false });
	const artifact = expectPreparedArtifact({
		result: run,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
	});
	const { priceId } = expectPreparedArtifactRowIds({ artifact });

	const migratedConfig = run.result.prices.find((p) => p.id === priceId)
		?.config as PriceStripeConfig | undefined;

	// ── The actual fix: reuse finds the PREPAID price, not the metered one ──
	expect(migratedConfig?.stripe_price_id).toBe(preSeededConfig.stripe_price_id);
	expect(migratedConfig?.stripe_product_id).toBe(preSeededConfig.stripe_product_id);
	expect(migratedConfig?.stripe_prepaid_price_v2_id).toBe(
		preSeededConfig.stripe_prepaid_price_v2_id,
	);
});
