/**
 * TDD test for plan variants carrying Stripe resource IDs from the base plan.
 *
 * Contract under test:
 *   New endpoints:
 *     - POST /plans.create_variant -> ApiPlanV1
 *   New behaviors:
 *     - create_variant carries base product.processor.id onto the variant product.
 *     - create_variant carries config.stripe_product_id for every matching
 *       Stripe-backed plan item.
 *     - create_variant carries config.stripe_meter_id for every matching
 *       metered usage plan item.
 *     - matching remains item-specific across fixed base price, usage-based,
 *       prepaid, and duplicate feature_id/different reset interval items.
 *   Side effects:
 *     - Persisted variant Product and Price rows reuse the base Stripe product
 *       and matching price-level Stripe resources instead of creating fresh ones.
 *
 * Pre-impl red: product.processor.id is not copied from the base product.
 * Post-impl green: all matching Stripe resource IDs are present on the variant.
 */

import { test } from "bun:test";
import { ApiVersion, ProductItemInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { expectStripeResourcesCarriedToVariant } from "./utils/expectVariantProductCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";

test.concurrent(
	`${chalk.yellowBright("variants stripe resources: create_variant carries product, price product, and meter IDs")}`,
	async () => {
		const cid = readableVariantTestId("stripe_carryover");
		const base = products.base({
			id: `stripe_base_${cid}`,
			items: [
				items.monthlyPrice({ price: 20 }),
				items.consumable({
					featureId: TestFeature.Credits,
					price: 0.01,
					billingUnits: 1,
					interval: ProductItemInterval.Month,
				}),
				items.prepaid({
					featureId: TestFeature.Messages,
					price: 3,
					billingUnits: 100,
					interval: ProductItemInterval.Month,
				}),
				items.prepaid({
					featureId: TestFeature.Credits,
					price: 5,
					billingUnits: 25,
					interval: ProductItemInterval.Day,
					priceInterval: ProductItemInterval.Month,
				}),
			],
		});

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `stripe_var_${cid}`;

		await rpc.post("/plans.create_variant", {
			base_plan_id: base.id,
			variant_plan_id: variantId,
			name: "Stripe Resource Variant",
		});

		const baseFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: base.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const variantFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		expectStripeResourcesCarriedToVariant({
			base: baseFull,
			variant: variantFull,
			requireMeter: true,
		});
	},
);
