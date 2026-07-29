// Repro for catalog.update 500 `duplicate key ... "entitlements_id_key"`: a variant
// customize inheriting unchanged base rows must not reuse the base plan's row ids.

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test.concurrent(
	`${chalk.yellowBright("catalog: variant customize inherits unchanged base item without entitlement id collision")}`,
	async () => {
		const suffix = Math.random().toString(36).slice(2, 9);
		const planId = `catalog_variant_inherit_${suffix}`;
		const variantId = `${planId}_enterprise`;
		const seatsFeatureId = `seats_${suffix}`;
		const creditsFeatureId = `credits_${suffix}`;

		const { autumnV2_2, ctx } = await initScenario({ setup: [], actions: [] });

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
					price: { amount: 35, interval: "month" },
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

		const expectVariantOwnsItsRows = async () => {
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
			const basePriceIds = new Set(base.prices.map((price) => price.id));

			expect(variant.entitlements).toHaveLength(2);
			expect(variant.prices).toHaveLength(1);
			for (const entitlement of variant.entitlements) {
				expect(baseEntitlementIds.has(entitlement.id)).toBe(false);
			}
			for (const price of variant.prices) {
				expect(basePriceIds.has(price.id)).toBe(false);
			}

			const variantSeats = variant.entitlements.find(
				(entitlement) => entitlement.feature_id === seatsFeatureId,
			);
			const variantCredits = variant.entitlements.find(
				(entitlement) => entitlement.feature_id === creditsFeatureId,
			);
			expect(variantSeats?.allowance).toBe(25);
			expect(variantCredits?.allowance).toBe(100);
		};

		await autumnV2_2.catalog.update(catalogParams);
		await expectVariantOwnsItsRows();

		// The customer report: retrying the identical push also failed.
		await autumnV2_2.catalog.update(catalogParams);
		await expectVariantOwnsItsRows();
	},
);
