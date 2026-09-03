/**
 * catalogV2.update — a supplied Stripe price id on the BASE price is adopted.
 *
 * A base price is fixed, so its id belongs in `stripe_price_id`, not the
 * prepaid v2 slot that item prices use. The schema carried `processors` here
 * already; nothing read it, so the id was accepted and dropped.
 *
 * Contract:
 *   C1  `plan.price.processors.stripe.price_id` lands in stripe_price_id and
 *       no new price is minted
 *   C2  the adopted price's own Stripe product is recorded on the config
 *   C3  re-stating a different id re-points the price and its product — the
 *       definition is unchanged, so the claim layer would otherwise drop it
 *   C4  an id Stripe does not know is a hard error, not a silent mint
 *
 * Red (current): basePriceToProductItem ignores `processors`, so the id never
 *   reaches the slot and Autumn mints its own price.
 * Green (after): the slot holds the supplied id; a missing id 400s.
 */

import { expect, test } from "bun:test";
import { BillingInterval, type FullProduct } from "@autumn/shared";
import {
	findBasePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type Stripe from "stripe";
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

const basePrice = ({ priceId }: { priceId?: string } = {}) => ({
	amount: BASE_AMOUNT,
	interval: BillingInterval.Month,
	...(priceId ? { processors: { stripe: { price_id: priceId } } } : {}),
});

const baseSlots = ({ product }: { product: FullProduct }) => {
	const price = findBasePrice({ product });
	return {
		priceId: stripeConfigValue({ price, field: "stripe_price_id" }),
		productId: stripeConfigValue({ price, field: "stripe_product_id" }),
	};
};

/** A price Autumn did not make — the shape a real import starts from. */
const createExternalPrice = async ({
	stripeCli,
	label,
}: {
	stripeCli: Stripe;
	label: string;
}) => {
	const product = await stripeCli.products.create({
		name: `External Base ${label}`,
	});
	const price = await stripeCli.prices.create({
		product: product.id,
		currency: "usd",
		unit_amount: BASE_AMOUNT * 100,
		recurring: { interval: "month" },
	});
	return { productId: product.id, priceId: price.id };
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors base price: a supplied price id is adopted with its product")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_base_adopt");
		const external = await createExternalPrice({
			stripeCli: ctx.stripeCli,
			label: planId,
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Base Price Adopt",
							price: basePrice({ priceId: external.priceId }),
							items: [],
						},
					],
				});

				const slots = baseSlots({ product: await getFull({ ctx, planId }) });
				// C1: the stated id landed — no freshly minted price.
				expect(slots.priceId, "adopted base price id").toBe(external.priceId);
				// C2: the product comes from the adopted price.
				expect(slots.productId, "adopted price's own product").toBe(
					external.productId,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors base price: re-stating a different id re-points the price")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_base_remap");
		const first = await createExternalPrice({
			stripeCli: ctx.stripeCli,
			label: `${planId}_a`,
		});
		const second = await createExternalPrice({
			stripeCli: ctx.stripeCli,
			label: `${planId}_b`,
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Base Price Remap",
							price: basePrice({ priceId: first.priceId }),
							items: [],
						},
					],
				});
				expect(
					baseSlots({ product: await getFull({ ctx, planId }) }).priceId,
					"first mapping",
				).toBe(first.priceId);

				// Same amount and interval, so the price definition is unchanged and
				// the claim layer keeps the current row unless the mapping is noticed.
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, price: basePrice({ priceId: second.priceId }) },
					],
				});

				const slots = baseSlots({ product: await getFull({ ctx, planId }) });
				// C3: both the price and its product follow the restated id.
				expect(slots.priceId, "re-mapped base price id").toBe(second.priceId);
				expect(slots.productId, "product re-pointed").toBe(second.productId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors base price: an unknown price id errors instead of minting")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_base_bad");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				// C4: a plausible but non-existent id must fail loudly.
				const update = autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Base Price Bad",
							price: basePrice({ priceId: "price_1NoSuchBasePriceAtAll" }),
							items: [],
						},
					],
				});
				await expect(update).rejects.toThrow();
			},
		});
	},
);
