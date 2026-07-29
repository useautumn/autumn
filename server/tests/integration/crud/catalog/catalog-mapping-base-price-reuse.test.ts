/**
 * TDD test: linking a Stripe product to a plan family (scope: base_price) must
 * reuse matching existing Stripe prices for the base plan AND every variant,
 * even when the Stripe prices carry tax_behavior (e.g. "exclusive").
 *
 * Red-failure mode (current behavior):
 *  - stripePriceShapesEqual compares taxBehavior strictly; Autumn shapes never
 *    set it ("unspecified"), so Stripe prices with tax_behavior "exclusive"
 *    never match and config.stripe_price_id stays null on every fixed price.
 *
 * Green-success criteria (after fix):
 *  - Base plan's $20/mo price links to the $20/mo Stripe price; the variant's
 *    $35/mo price links to the $35/mo Stripe price.
 */

import { test } from "bun:test";
import {
	type ApiPlanV1,
	ApiVersion,
	BillingInterval,
	type UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { createVariantPlan } from "../plans/variants/utils/variantTestPlanUtils.js";
import {
	createCatalogMappingProducts,
	expectFixedStripePriceId,
	expectPriceStripeProduct,
	findBasePrice,
	getPlanFamilyVersions,
} from "./utils/catalogMappingTestUtils.js";

type RpcUpdate = Omit<UpdatePlanParamsV2Input, "plan_id">;

test.concurrent(
	`${chalk.yellowBright("catalog mappings: base_price scope reuses tax-exclusive Stripe prices across variant family")}`,
	async () => {
		const planId = "catalog_mappings_base_reuse_tax";
		const variantPlanId = `${planId}_35`;
		// products.pro already includes a $20/mo base price
		const product = products.pro({ id: planId, items: [] });

		const { autumnV2_2, ctx } = await initScenario({
			customerId: "catalog-mappings-base-reuse-tax",
			setup: [],
			actions: [],
		});
		await createCatalogMappingProducts({
			ctx,
			autumn: autumnV2_2,
			products: [product],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		await createVariantPlan({
			rpc,
			basePlanId: planId,
			variantPlanId,
			name: "Base Reuse Tax 35",
		});
		await rpc.plans.update<ApiPlanV1, RpcUpdate>(variantPlanId, {
			price: { amount: 35, interval: BillingInterval.Month },
			disable_version: true,
		});

		const stripeProduct = await ctx.stripeCli.products.create({
			name: `Catalog mapping base reuse ${planId}`,
		});
		const stripePrice20 = await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			currency: "usd",
			unit_amount: 2000,
			recurring: { interval: "month" },
			tax_behavior: "exclusive",
		});
		const stripePrice35 = await ctx.stripeCli.prices.create({
			product: stripeProduct.id,
			currency: "usd",
			unit_amount: 3500,
			recurring: { interval: "month" },
			tax_behavior: "exclusive",
		});

		await autumnV2_2.post("/catalog.update_mappings", {
			processor_type: "stripe",
			plan_mappings: [
				{
					plan_id: planId,
					stripe_product_id: stripeProduct.id,
					scope: "base_price",
					item_mappings: [],
				},
			],
		});

		const family = await getPlanFamilyVersions({ ctx, basePlanId: planId });
		const expectedByPlanId: Record<string, string> = {
			[planId]: stripePrice20.id,
			[variantPlanId]: stripePrice35.id,
		};

		for (const version of family) {
			const basePrice = findBasePrice(version.prices);
			expectPriceStripeProduct({
				price: basePrice,
				stripeProductId: stripeProduct.id,
			});
			expectFixedStripePriceId({
				price: basePrice,
				stripePriceId: expectedByPlanId[version.id] ?? null,
			});
		}
	},
);
