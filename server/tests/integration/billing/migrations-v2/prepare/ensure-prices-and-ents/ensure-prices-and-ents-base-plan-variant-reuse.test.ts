/**
 * TDD test for Stripe resource reuse across a plan VARIANT and its BASE plan
 * (e.g. Mintlify's `pro_yearly` reusing `pro`'s prepaid credit item price)
 * during migrations-v2 `update_plan` catalog preparation.
 *
 * Contract under test:
 *   When a migration adds an item to a variant plan (a product whose
 *   `base_variant_id` points at another plan, e.g. `pro_yearly` -> `pro`),
 *   and the BASE plan's latest version already carries a real (non-custom)
 *   price for that same feature — because someone pre-seeded it via ordinary
 *   catalog editing, exactly as Mintlify plans to do before running its tier
 *   migration — the variant's newly-synthesized price must REUSE the base
 *   plan's real `stripe_price_id` / `stripe_product_id` /
 *   `stripe_prepaid_price_v2_id`, not mint its own independent Stripe price.
 *
 * Red-failure mode (before this fix): `inheritStripeResourcesFromLatestVersion`
 * resolved reuse candidates using only `product.id` (the variant's own plan
 * id), never consulting `base_variant_id` — so a variant's own version
 * history was searched (finding nothing, since the variant never had this
 * item before) instead of the base plan's, and the variant minted its own
 * independent Stripe price instead of reusing the base plan's.
 *
 * Green-success criteria (after fix): resolves `basePlanId =
 * product.base_variant_id ?? product.id`, queries that plan's own catalog
 * data directly (not the current op's `matchedProducts`, which is scoped to
 * this op's `plan_filter` and would never include a different plan_id's
 * rows), and reuses its latest version's non-custom price.
 */

import { expect, test } from "bun:test";
import { products as productsTable } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
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

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: variant plan reuses its BASE plan's Stripe resources")}`, async () => {
	const baseCustomerId = "prep-base-variant-reuse-base";
	const variantCustomerId = "prep-base-variant-reuse-variant";

	const pro = products.pro({ id: "pro", items: [] });
	const proYearly = products.pro({ id: "pro_yearly", items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: baseCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: variantCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, proYearly] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: proYearly.id, customerId: variantCustomerId }),
		],
	});

	// Simulate `pro_yearly` being a variant of `pro` (same as Mintlify's real
	// catalog, where growth_yearly/pro_yearly point back at growth/pro).
	await ctx.db
		.update(productsTable)
		.set({ base_variant_id: pro.id })
		.where(
			and(
				eq(productsTable.id, proYearly.id),
				eq(productsTable.org_id, ctx.org.id),
				eq(productsTable.env, ctx.env),
			),
		);

	// Pre-seed: add the new tier ladder to `pro`'s CURRENT version via ordinary
	// (non-custom) catalog editing — exactly what Mintlify will do before
	// running the real migration. This creates a real Stripe price/product/v2
	// prepaid price through the normal billing path.
	await autumnV1.products.update(pro.id, {
		items: [
			items.volumePrepaidMessages({
				includedUsage: 0,
				tiers: [
					{ to: 2000, amount: 30 },
					{ to: "inf", amount: 12 },
				],
			}),
		],
	});

	const latestProVersion = await ctx.db.query.products.findFirst({
		where: (p, { eq: eqOp, and: andOp }) =>
			andOp(eqOp(p.id, pro.id), eqOp(p.org_id, ctx.org.id), eqOp(p.env, ctx.env)),
		orderBy: (p, { desc }) => desc(p.version),
	});
	if (!latestProVersion) {
		throw new Error("Expected pro's latest version to exist");
	}
	const proNonCustomPrices = await ctx.db.query.prices.findMany({
		where: (p, { eq: eqOp, and: andOp }) =>
			andOp(
				eqOp(p.internal_product_id, latestProVersion.internal_id),
				eqOp(p.is_custom, false),
			),
	});
	const preSeededPro = proNonCustomPrices.find(
		(p) => (p.config as { type?: string }).type === "usage",
	);
	if (!preSeededPro?.config) {
		throw new Error("Expected pre-seeded pro price to exist");
	}
	const preSeededConfig = preSeededPro.config as PriceStripeConfig;
	if (
		!preSeededConfig.stripe_price_id ||
		!preSeededConfig.stripe_product_id ||
		!preSeededConfig.stripe_prepaid_price_v2_id
	) {
		throw new Error("Expected pre-seeded pro price to have real Stripe ids");
	}

	// Migration targets `pro_yearly` ONLY — its op's own `matchedProducts` never
	// includes `pro` at all, so any reuse must come from resolving the base
	// plan explicitly, not from whatever this op happened to match.
	const operations = buildUpdatePlanOperations({
		planId: proYearly.id,
		customize: {
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
		id: `${variantCustomerId}-mig`,
		filter: { customer: { plan: { plan_id: proYearly.id } } },
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

	const variantConfig = run.result.prices.find((p) => p.id === priceId)
		?.config as PriceStripeConfig | undefined;

	// ── The actual fix: pro_yearly's new price reuses pro's real Stripe ids ──
	expect(variantConfig?.stripe_price_id).toBe(preSeededConfig.stripe_price_id);
	expect(variantConfig?.stripe_product_id).toBe(preSeededConfig.stripe_product_id);
	expect(variantConfig?.stripe_prepaid_price_v2_id).toBe(
		preSeededConfig.stripe_prepaid_price_v2_id,
	);
});
