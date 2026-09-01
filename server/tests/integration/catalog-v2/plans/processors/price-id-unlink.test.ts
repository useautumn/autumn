/**
 * catalogV2.update — an explicit `processors.stripe: null` unlinks a price.
 *
 * Presence in the body is the signal. A normal plan edit re-sends every item
 * without a `processors` key, so an omitted key has to leave the mapping
 * exactly where it is; only a stated null unlinks. Unlike a plan's Stripe
 * product, a paid price has to bill from SOME Stripe price, so init mints a
 * replacement on the same request — what the unlink guarantees is that the
 * adopted id is gone, not that the slot stays empty.
 *
 * Contract:
 *   U1  `price.processors.stripe: null` drops an adopted id from the prepaid
 *       v2 slot the item bills from
 *   U2  the same on `plan.price` drops it from the base price's v1 slot
 *   U3  an edit that omits `processors` keeps the adopted id — the routine
 *       save must never read as an unlink
 *
 * Red (before): `price_id` was a bare string and `stripe` was `.optional()`,
 *   so the request 400d before it could express an unlink at all.
 * Green (after): the stated null clears the slot the mapping occupied, and an
 *   omitted key still leaves it alone.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import {
	findBasePrice,
	findFeaturePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
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

/** A price Autumn did not make — the shape a real import starts from. */
const createExternalPrice = async ({
	stripeCli,
	label,
}: {
	stripeCli: Stripe;
	label: string;
}) => {
	const product = await stripeCli.products.create({
		name: `External ${label}`,
	});
	const price = await stripeCli.prices.create({
		product: product.id,
		currency: "usd",
		unit_amount: 1000,
		recurring: { interval: "month" },
	});
	return price.id;
};

/** `undefined` states nothing; `null` unlinks; a string adopts. */
const prepaidItem = ({ priceId }: { priceId?: string | null }) => ({
	feature_id: TestFeature.Messages,
	included: 100,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
		...(priceId === undefined
			? {}
			: { processors: { stripe: priceId ? { price_id: priceId } : null } }),
	},
});

const basePrice = ({ priceId }: { priceId?: string | null }) => ({
	amount: BASE_AMOUNT,
	interval: BillingInterval.Month,
	...(priceId === undefined
		? {}
		: { processors: { stripe: priceId ? { price_id: priceId } : null } }),
});

const v2PriceIdOf = ({ product }: { product: FullProduct }): string | null =>
	stripeConfigValue({
		price: findFeaturePrice({ product, featureId: TestFeature.Messages }),
		field: "stripe_prepaid_price_v2_id",
	});

const basePriceIdOf = ({ product }: { product: FullProduct }): string | null =>
	stripeConfigValue({
		price: findBasePrice({ product }),
		field: "stripe_price_id",
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: a stated null unlinks an adopted price id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_price_unlink");
		const adoptedPriceId = await createExternalPrice({
			stripeCli: ctx.stripeCli,
			label: `Prepaid ${planId}`,
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Price Unlink",
							items: [prepaidItem({ priceId: adoptedPriceId })],
						},
					],
				});
				expect(
					v2PriceIdOf({ product: await getFull({ ctx, planId }) }),
					"starts mapped to the adopted price",
				).toBe(adoptedPriceId);

				// U3: the routine save — same definition, no `processors` key.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, items: [prepaidItem({})] }],
				});
				expect(
					v2PriceIdOf({ product: await getFull({ ctx, planId }) }),
					"an omitted processors key is not an unlink",
				).toBe(adoptedPriceId);

				// U1: the stated null is.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, items: [prepaidItem({ priceId: null })] }],
				});
				expect(
					v2PriceIdOf({ product: await getFull({ ctx, planId }) }),
					"the adopted price id is gone",
				).not.toBe(adoptedPriceId);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors price: a stated null unlinks an adopted base price id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_base_unlink");
		const adoptedPriceId = await createExternalPrice({
			stripeCli: ctx.stripeCli,
			label: `Base ${planId}`,
		});

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "Base Price Unlink",
							price: basePrice({ priceId: adoptedPriceId }),
						},
					],
				});
				expect(
					basePriceIdOf({ product: await getFull({ ctx, planId }) }),
					"starts mapped to the adopted price",
				).toBe(adoptedPriceId);

				// U3 again, on the base lane.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, price: basePrice({}) }],
				});
				expect(
					basePriceIdOf({ product: await getFull({ ctx, planId }) }),
					"an omitted processors key is not an unlink",
				).toBe(adoptedPriceId);

				// U2: the stated null clears the v1 slot the base price bills from.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, price: basePrice({ priceId: null }) }],
				});
				expect(
					basePriceIdOf({ product: await getFull({ ctx, planId }) }),
					"the adopted base price id is gone",
				).not.toBe(adoptedPriceId);
			},
		});
	},
);
