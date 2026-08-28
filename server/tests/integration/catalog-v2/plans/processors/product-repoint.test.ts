/**
 * catalogV2.update — changing a plan's Stripe product moves its base price.
 *
 * A plan is billed under the Stripe product its base price belongs to. The
 * legacy mappings endpoint moved the price whenever the product changed;
 * `processors` only stamped product.processor, so the mapping was cosmetic and
 * checkout kept charging the old product's price.
 *
 * Contract:
 *   D1  a matching price already under the new product is reused, not duplicated
 *   D2  with nothing to match, the stale ids are cleared and a price is minted
 *       under the new product
 *   D3  a request that restates the price id itself wins — the re-point leaves
 *       it alone rather than overwriting a stated mapping
 *
 * Red (current): applyPlanProcessorsToProduct never touches price configs, and
 *   init skips the price because every slot is still filled.
 * Green (after): the base price's product follows the plan's.
 */

import { expect, test } from "bun:test";
import { BillingInterval, type FullProduct } from "@autumn/shared";
import {
	findBasePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const BASE_AMOUNT = 20;

const getFull = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const baseSlots = ({ product }: { product: FullProduct }) => {
	const price = findBasePrice({ product });
	return {
		priceId: stripeConfigValue({ price, field: "stripe_price_id" }),
		productId: stripeConfigValue({ price, field: "stripe_product_id" }),
	};
};

const seedPaidPlan = async ({
	autumn,
	planId,
	name,
}: {
	autumn: { catalogV2: { update: (params: unknown) => Promise<unknown> } };
	planId: string;
	name: string;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name,
				price: { amount: BASE_AMOUNT, interval: BillingInterval.Month },
				items: [],
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors repoint: a matching price under the new product is reused")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_repoint_match");
		const externalProduct = await ctx.stripeCli.products.create({
			name: `Repoint Match ${planId}`,
		});
		const externalPrice = await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			currency: "usd",
			unit_amount: BASE_AMOUNT * 100,
			recurring: { interval: "month" },
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedPaidPlan({
					autumn: autumnV2_3,
					planId,
					name: "Repoint Match",
				});
				const minted = baseSlots({ product: await getFull({ ctx, planId }) });
				expect(minted.priceId, "autumn minted a base price").toMatch(/^price_/);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: externalProduct.id } },
						},
					],
				});

				// D1: the existing $20/mo price under the new product is adopted,
				// rather than a second identical price being created.
				const slots = baseSlots({ product: await getFull({ ctx, planId }) });
				expect(slots.productId, "price product follows the plan").toBe(
					externalProduct.id,
				);
				expect(slots.priceId, "reused the matching price").toBe(
					externalPrice.id,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors repoint: with no match the stale price is replaced")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_repoint_mint");
		const externalProduct = await ctx.stripeCli.products.create({
			name: `Repoint Mint ${planId}`,
		});
		// Deliberately a different amount, so nothing under the product matches.
		await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			currency: "usd",
			unit_amount: 9900,
			recurring: { interval: "month" },
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedPaidPlan({
					autumn: autumnV2_3,
					planId,
					name: "Repoint Mint",
				});
				const minted = baseSlots({ product: await getFull({ ctx, planId }) });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: externalProduct.id } },
						},
					],
				});

				// D2: the old id must not survive — it belongs to a product this
				// plan no longer maps to.
				const slots = baseSlots({ product: await getFull({ ctx, planId }) });
				expect(slots.productId, "price product follows the plan").toBe(
					externalProduct.id,
				);
				expect(slots.priceId, "stale price replaced").not.toBe(minted.priceId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors repoint: a restated price id wins over the re-point")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_repoint_stated");
		const statedProduct = await ctx.stripeCli.products.create({
			name: `Repoint Stated ${planId}`,
		});
		const statedPrice = await ctx.stripeCli.prices.create({
			product: statedProduct.id,
			currency: "usd",
			unit_amount: BASE_AMOUNT * 100,
			recurring: { interval: "month" },
		});
		const planProduct = await ctx.stripeCli.products.create({
			name: `Repoint Plan ${planId}`,
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedPaidPlan({
					autumn: autumnV2_3,
					planId,
					name: "Repoint Stated",
				});

				// Both change at once: the plan moves to one product while the price
				// is stated under another.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							processors: { stripe: { product_id: planProduct.id } },
							price: {
								amount: BASE_AMOUNT,
								interval: BillingInterval.Month,
								processors: { stripe: { price_id: statedPrice.id } },
							},
						},
					],
				});

				// D3: feature prices already live under their own products, so a
				// stated price is honoured rather than dragged to the plan's.
				const slots = baseSlots({ product: await getFull({ ctx, planId }) });
				expect(slots.priceId, "stated price kept").toBe(statedPrice.id);
				expect(slots.productId, "stated price's own product kept").toBe(
					statedProduct.id,
				);
			},
		});
	},
);
