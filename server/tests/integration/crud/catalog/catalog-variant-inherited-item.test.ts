/**
 * TDD test for catalog.update failing when a variant customize replaces one
 * base item while inheriting another unchanged (Remy `atmn push` report).
 *
 * Red-failure mode (current behavior):
 *  - catalog.update 500s with `duplicate key value violates unique constraint
 *    "entitlements_id_key"`: the variant target plan is built from the base
 *    plan's API response, whose items carry the base's entitlement_id/price_id,
 *    so the inherited item is inserted reusing the base plan's entitlement id.
 *
 * Green-success criteria (after fix):
 *  - catalog.update succeeds, the variant owns entitlement rows distinct from
 *    the base plan's, and an identical re-push also succeeds.
 */

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test(`${chalk.yellowBright("catalog: variant customize inherits unchanged base item without entitlement id collision")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_variant_inherit_${suffix}`;
	const variantId = `${planId}_enterprise`;
	const seatsFeatureId = `seats_${suffix}`;
	const creditsFeatureId = `credits_${suffix}`;

	const { autumnV2_2 } = await initScenario({ setup: [], actions: [] });

	const catalogParams = {
		features: [
			{
				feature_id: seatsFeatureId,
				name: "Seats",
				type: FeatureType.Metered,
				consumable: true,
			},
			{
				feature_id: creditsFeatureId,
				name: "Credits",
				type: FeatureType.Metered,
				consumable: true,
			},
		],
		plans: [
			{
				plan_id: planId,
				name: "Base",
				items: [
					{
						feature_id: seatsFeatureId,
						included: 5,
						reset: { interval: "month" },
					},
					{
						feature_id: creditsFeatureId,
						included: 100,
						reset: { interval: "month" },
					},
				],
				variants: [
					{
						variant_plan_id: variantId,
						name: "Enterprise",
						customize: {
							remove_items: [
								{ feature_id: seatsFeatureId, interval: "month" },
							],
							add_items: [
								{
									feature_id: seatsFeatureId,
									included: 25,
									reset: { interval: "month" },
								},
							],
						},
					},
				],
			},
		],
	};

	await autumnV2_2.catalog.update(catalogParams);

	const [base, variant] = await Promise.all([
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
		ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);

	const baseEntitlementIds = new Set(
		base.entitlements.map((entitlement) => entitlement.id),
	);
	expect(variant.entitlements).toHaveLength(2);
	for (const entitlement of variant.entitlements) {
		expect(baseEntitlementIds.has(entitlement.id)).toBe(false);
	}

	const variantSeats = variant.entitlements.find(
		(entitlement) => entitlement.feature_id === seatsFeatureId,
	);
	const variantCredits = variant.entitlements.find(
		(entitlement) => entitlement.feature_id === creditsFeatureId,
	);
	expect(variantSeats?.allowance).toBe(25);
	expect(variantCredits?.allowance).toBe(100);

	// The customer report: retrying the same push kept failing.
	await autumnV2_2.catalog.update(catalogParams);
});
