/**
 * TDD test for Stripe price/product reuse during migrations-v2 `update_plan`
 * catalog preparation (Mintlify tier-migration scenario).
 *
 * Contract under test:
 *   When an `update_plan` migration's `plan_filter` matches MULTIPLE existing
 *   catalog product VERSIONS of the same plan (e.g. an old version still held
 *   by some customers, and the current/latest version held by others), and
 *   the migration adds the exact same new item (e.g. a new prepaid tier
 *   ladder) to all of them, `ensurePricesAndEntitlements` must:
 *     - still create one distinct Autumn `prices` row per matched version
 *       (unchanged — each version keeps its own row), but
 *     - create exactly ONE real Stripe price (`config.stripe_price_id`) and
 *       ONE real Stripe v2 prepaid price (`config.stripe_prepaid_price_v2_id`)
 *       for that new item, REUSED across every matched version's row —
 *       not one independent Stripe price per matched version.
 *
 * Pre-fix red: `ensurePricesAndEntitlements.apply()` ran Stripe resource
 * reuse across all matched versions in one parallel `Promise.all` pass. Since
 * every matched version starts that pass with an identical, brand-new
 * synthesized price and none has a real Stripe id yet, reuse always found
 * nothing to copy — every version minted its own independent Stripe price.
 *
 * Post-fix green: `apply()` groups matched products by `product.id` (never
 * across different plans) and resolves each group SEQUENTIALLY, reusing
 * against whatever's already been resolved in that group so far before
 * creating for real — so only the first version processed in a group pays
 * for a real Stripe price; every sibling reuses it.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { buildUpdatePlanOperations, createMigration } from "../../utils/migrationTestUtils.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";
import { getPreparedCustomerRows } from "./utils/getPreparedCustomerRows.js";
import { expectPreparedStripePriceReused } from "./utils/expectPreparedStripeProducts.js";

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: Stripe price/product reused across matched product versions")}`, async () => {
	const oldVersionCustomerId = "prep-stripe-reuse-old-version";
	const latestVersionCustomerId = "prep-stripe-reuse-latest-version";

	const pro = products.pro({
		id: "pro",
		items: [
			items.volumePrepaidMessages({
				tiers: [{ to: 500, amount: 10 }, { to: "inf", amount: 5 }],
			}),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: oldVersionCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: latestVersionCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Bump pro to a new version (customers already on v1 stay there; new
	// attaches resolve to this new version) — mirrors Mintlify's real catalog,
	// which has many historical versions of the same plan.
	await autumnV1.products.update(pro.id, {
		items: [
			items.volumePrepaidMessages({
				tiers: [{ to: 500, amount: 10 }, { to: "inf", amount: 5 }],
			}),
			items.dashboard(),
		],
	});

	await autumnV2_2.billing.attach({
		customer_id: latestVersionCustomerId,
		plan_id: pro.id,
	});

	const beforeRows = await getPreparedCustomerRows({
		ctx,
		customerIds: [oldVersionCustomerId, latestVersionCustomerId],
		productId: pro.id,
	});
	const oldVersionInternalProductId = beforeRows.find(
		(row) => row.customerId === oldVersionCustomerId,
	)?.customerProductInternalProductId;
	const latestVersionInternalProductId = beforeRows.find(
		(row) => row.customerId === latestVersionCustomerId,
	)?.customerProductInternalProductId;
	if (!oldVersionInternalProductId || !latestVersionInternalProductId) {
		throw new Error("Expected both customers to have a customer product");
	}
	// Sanity check the scenario actually spans two distinct catalog versions —
	// if this ever fails, the rest of the test isn't testing what it claims to.
	expect(latestVersionInternalProductId).not.toBe(oldVersionInternalProductId);

	// Mirrors migrate-tiers.ts's buildNonEnterpriseDefinition: replace the old
	// prepaid item with a brand-new tier ladder, applied to every matched
	// version of the same plan via one `update_plan` op (no `version` bump).
	const operations = buildUpdatePlanOperations({
		planId: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.volumePrepaidMessages({
					tiers: [
						{ to: 1000, amount: 20 },
						{ to: "inf", amount: 8 },
					],
				}),
			],
		},
	});
	const migrationId = `${oldVersionCustomerId}-mig-${Date.now()}`;
	await createMigration({
		migrationClient: autumnV2_2,
		id: migrationId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations,
	});

	await autumnV2_2.migrationsV2.run({
		id: migrationId,
		dry_run: false,
	});

	// `getPreparedCustomerRows` left-joins customer_prices AND customer_entitlements
	// off the same customerProduct independently, so a customerProduct with both a
	// base fixed price and a prepaid usage price yields a cross-product of rows —
	// query `prices` directly per matched version instead. Each matched version
	// still carries its ORIGINAL catalog prepaid price row alongside the
	// migration's new synthetic one (`remove_items` only drops the customer's
	// association, it doesn't delete the catalog row) — `is_custom` distinguishes
	// the migration-synthesized row from the original. Migration execution is
	// async, so poll until both rows exist.
	const loadPriceRows = () =>
		ctx.db.query.prices.findMany({
			where: (p, { inArray: inArr }) =>
				inArr(p.internal_product_id, [
					oldVersionInternalProductId,
					latestVersionInternalProductId,
				]),
		});
	const migratedPriceFor = (
		rows: Awaited<ReturnType<typeof loadPriceRows>>,
		internalProductId: string,
	) =>
		rows.find(
			(row) =>
				row.internal_product_id === internalProductId &&
				row.is_custom === true &&
				Boolean((row.config as { stripe_price_id?: string }).stripe_price_id),
		)?.id;

	let oldVersionPriceId: string | undefined;
	let latestVersionPriceId: string | undefined;
	await waitForMigrationResult({
		timeoutMs: 30_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const rows = await loadPriceRows();
			oldVersionPriceId = migratedPriceFor(rows, oldVersionInternalProductId);
			latestVersionPriceId = migratedPriceFor(rows, latestVersionInternalProductId);
			if (!oldVersionPriceId || !latestVersionPriceId) {
				throw new Error(
					"Expected both matched product versions to have a migrated prepaid price row with a real Stripe id attached",
				);
			}
		},
	});
	if (!oldVersionPriceId || !latestVersionPriceId) {
		throw new Error(
			"Expected both matched product versions to have a migrated prepaid price row",
		);
	}

	// ── Contract assertion 1: each matched version keeps its own Autumn price row ──
	expect(oldVersionPriceId).not.toBe(latestVersionPriceId);

	// ── Contract assertion 2 (the actual fix): those two DIFFERENT Autumn price
	// rows share the SAME real Stripe price + v2 prepaid price, not one each ──
	await expectPreparedStripePriceReused({
		ctx,
		priceIds: [oldVersionPriceId, latestVersionPriceId],
	});
});
