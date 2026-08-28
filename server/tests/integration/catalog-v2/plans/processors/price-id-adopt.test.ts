/**
 * catalogV2.update — a supplied Stripe price id is adopted, never re-minted.
 *
 * Only the V2 prepaid slot is mappable. V1 prices and meters keep minting as
 * they do today; the sole new behavior is that a stated price id is used
 * as-is, and a bad one fails loudly instead of Autumn minting a price and
 * handing back an id nobody asked for.
 *
 * Contract:
 *   B7  `price.processors.stripe.price_id` lands in stripe_prepaid_price_v2_id
 *       and no new V2 price is minted
 *   B8  a supplied id Stripe does not recognise is a hard error — and no
 *       replacement price is silently created
 *   B9  a zero-included prepaid item keeps the supplied id. Autumn aliases the
 *       V2 slot to the V1 price on that branch, but a filled slot means the
 *       mint never runs and the alias is never reached — this pins that.
 *   B11 re-mapping to a price under a different product re-points the
 *       product too — the stated price owns it, it is not gap-fill
 *   B10 the adopted price's own Stripe product is recorded on its config —
 *       every price creator already derives the product from the price it
 *       made, so the adopt path must do the same instead of minting one.
 *
 * Red (current): `price.processors` is stripped from write params (zod drops
 *   unknown keys), so the id never reaches the slot and Autumn mints its own.
 * Green (after): the slot holds the supplied id; a missing id 400s.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import {
	findFeaturePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

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

const prepaidItem = ({
	included,
	priceId,
}: {
	included: number;
	priceId?: string;
}) => ({
	feature_id: TestFeature.Messages,
	included,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
		...(priceId ? { processors: { stripe: { price_id: priceId } } } : {}),
	},
});

const v2PriceIdOf = ({ product }: { product: FullProduct }): string | null =>
	stripeConfigValue({
		price: findFeaturePrice({ product, featureId: TestFeature.Messages }),
		field: "stripe_prepaid_price_v2_id",
	});

const priceProductIdOf = ({
	product,
}: {
	product: FullProduct;
}): string | null =>
	stripeConfigValue({
		price: findFeaturePrice({ product, featureId: TestFeature.Messages }),
		field: "stripe_product_id",
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: a supplied price id is adopted, not re-minted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const donorId = uniqueTestId("cv2_price_adopt_src");
		const adopterId = uniqueTestId("cv2_price_adopt_dst");
		await withCatalogPlans({
			ctx,
			planIds: [donorId, adopterId],
			run: async () => {
				// A real Stripe price to point at — the shape an import starts from.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: donorId,
							name: "Price Adopt Donor",
							items: [prepaidItem({ included: 100 })],
						},
					],
				});
				const donor = await getFull({ ctx, planId: donorId });
				const donorPriceId = v2PriceIdOf({ product: donor });
				expect(donorPriceId, "donor minted a v2 price").toMatch(/^price_/);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: adopterId,
							name: "Price Adopt Target",
							items: [
								prepaidItem({
									included: 100,
									priceId: donorPriceId ?? undefined,
								}),
							],
						},
					],
				});

				// B7: the stated id is what landed — no freshly minted price.
				const adopter = await getFull({ ctx, planId: adopterId });
				expect(v2PriceIdOf({ product: adopter }), "adopted v2 price id").toBe(
					donorPriceId,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: an unknown price id errors instead of minting")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_adopt_bad");
		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				// B8: a plausible but non-existent id must fail loudly.
				const update = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Adopt Bad",
							items: [
								prepaidItem({
									included: 100,
									priceId: "price_1NoSuchPriceExistsAtAll",
								}),
							],
						},
					],
				});
				await expect(update).rejects.toThrow();
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: zero-included prepaid keeps the supplied id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const donorId = uniqueTestId("cv2_price_zero_src");
		const adopterId = uniqueTestId("cv2_price_zero_dst");
		await withCatalogPlans({
			ctx,
			planIds: [donorId, adopterId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: donorId,
							name: "Price Zero Donor",
							items: [prepaidItem({ included: 100 })],
						},
					],
				});
				const donorPriceId = v2PriceIdOf({
					product: await getFull({ ctx, planId: donorId }),
				});
				expect(donorPriceId, "donor minted a v2 price").toMatch(/^price_/);

				// included: 0 is the branch that aliases the v2 slot to the v1 price.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: adopterId,
							name: "Price Zero Target",
							items: [
								prepaidItem({
									included: 0,
									priceId: donorPriceId ?? undefined,
								}),
							],
						},
					],
				});

				// B9: the alias must not overwrite what the caller stated.
				const adopter = await getFull({ ctx, planId: adopterId });
				expect(
					v2PriceIdOf({ product: adopter }),
					"supplied id survives the zero-included alias",
				).toBe(donorPriceId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: an adopted price records its own stripe product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_prod");
		// A price Autumn did not make, under a product it would never resolve to —
		// the shape a real import starts from.
		const externalProduct = await ctx.stripeCli.products.create({
			name: `External Product ${planId}`,
		});
		const externalPrice = await ctx.stripeCli.prices.create({
			product: externalProduct.id,
			currency: "usd",
			unit_amount: 1000,
			recurring: { interval: "month" },
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Product Target",
							items: [
								prepaidItem({ included: 100, priceId: externalPrice.id }),
							],
						},
					],
				});

				// B10: the product comes from the adopted price, not a fresh mint.
				const adopter = await getFull({ ctx, planId });
				expect(v2PriceIdOf({ product: adopter }), "adopted price id").toBe(
					externalPrice.id,
				);
				expect(
					priceProductIdOf({ product: adopter }),
					"adopted price's own product is recorded",
				).toBe(externalProduct.id);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: changing the price re-points its product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_repoint");
		const makeExternal = async (label: string) => {
			const product = await ctx.stripeCli.products.create({
				name: `External ${label} ${planId}`,
			});
			const price = await ctx.stripeCli.prices.create({
				product: product.id,
				currency: "usd",
				unit_amount: 1000,
				recurring: { interval: "month" },
			});
			return { productId: product.id, priceId: price.id };
		};
		const first = await makeExternal("A");
		const second = await makeExternal("B");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Repoint",
							items: [prepaidItem({ included: 100, priceId: first.priceId })],
						},
					],
				});
				const before = await getFull({ ctx, planId });
				expect(priceProductIdOf({ product: before }), "first product").toBe(
					first.productId,
				);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [prepaidItem({ included: 100, priceId: second.priceId })],
						},
					],
				});

				// B11: the product follows the price, it does not stay on the old one.
				const after = await getFull({ ctx, planId });
				expect(v2PriceIdOf({ product: after }), "second price").toBe(
					second.priceId,
				);
				expect(priceProductIdOf({ product: after }), "product re-pointed").toBe(
					second.productId,
				);
			},
		});
	},
);
