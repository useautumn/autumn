/**
 * findNewestReusableFixedPrice
 *
 * Contract:
 *   newest created_at $25 with a usable stripe slot wins
 *   catalog $20 / interval mismatch / preview / self / other product.id → no
 *   USD attach uses base amount + stripe_price_id
 *   EUR attach uses currencies.eur amount + slot; USD-only → no
 *   catalog cannot reuse custom; custom can reuse catalog
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	PREVIEW_STRIPE_PRICE_ID_PREFIX,
	type Price,
	PriceType,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { priceRepo } from "@/internal/products/prices/repos/priceRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueSuffix } from "./feature-products/utils/createUnmintedFeaturePlans.js";

const targetFixed = ({
	amount = 25,
	interval = BillingInterval.Month,
	currencies,
}: {
	amount?: number;
	interval?: BillingInterval;
	currencies?: Record<string, { amount: number }>;
}): Price => ({
	id: generateId("pr"),
	org_id: "unused",
	created_at: Date.now(),
	internal_product_id: "unused",
	is_custom: true,
	config: {
		type: PriceType.Fixed,
		amount,
		interval,
		interval_count: 1,
		stripe_product_id: null,
		feature_id: null,
		internal_feature_id: null,
		...(currencies ? { currencies } : {}),
	},
	proration_config: null,
});

test.concurrent(
	`${chalk.yellowBright("priceRepo: findNewestReusableFixedPrice")}`,
	async () => {
		const suffix = uniqueSuffix();
		const pro = products.pro({ id: `fnrf-pro-${suffix}`, items: [] });
		const premium = products.premium({
			id: `fnrf-prem-${suffix}`,
			items: [],
		});

		const { ctx } = await initScenario({
			setup: [s.products({ list: [pro, premium], createInStripe: false })],
			actions: [],
		});

		const fullPro = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: pro.id,
		});
		const fullPremium = await ProductService.getFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			idOrInternalId: premium.id,
		});

		const insertFixed = async ({
			id,
			internalProductId,
			createdAt,
			amount,
			interval = BillingInterval.Month,
			stripePriceId,
			currencies,
			isCustom = true,
		}: {
			id: string;
			internalProductId: string;
			createdAt: number;
			amount: number;
			interval?: BillingInterval;
			stripePriceId?: string | null;
			currencies?: Record<
				string,
				{ amount: number; stripe_price_id?: string }
			>;
			isCustom?: boolean;
		}) => {
			await PriceService.insert({
				db: ctx.db,
				data: {
					id,
					org_id: ctx.org.id,
					internal_product_id: internalProductId,
					created_at: createdAt,
					is_custom: isCustom,
					config: {
						type: PriceType.Fixed,
						amount,
						interval,
						interval_count: 1,
						stripe_price_id: stripePriceId,
						stripe_product_id: null,
						feature_id: null,
						internal_feature_id: null,
						...(currencies ? { currencies } : {}),
					},
					proration_config: null,
				},
			});
		};

		const older = generateId("pr");
		const newer = generateId("pr");
		const preview = generateId("pr");
		const yearly = generateId("pr");
		const usdOnly = generateId("pr");
		const usdEur = generateId("pr");
		const otherPlan = generateId("pr");
		const catalog = generateId("pr");
		const now = Date.now();

		await insertFixed({
			id: older,
			internalProductId: fullPro.internal_id,
			createdAt: now - 100,
			amount: 25,
			stripePriceId: "price_old_25",
		});
		await insertFixed({
			id: newer,
			internalProductId: fullPro.internal_id,
			createdAt: now,
			amount: 25,
			stripePriceId: "price_new_25",
		});
		await insertFixed({
			id: preview,
			internalProductId: fullPro.internal_id,
			createdAt: now + 50,
			amount: 25,
			stripePriceId: `${PREVIEW_STRIPE_PRICE_ID_PREFIX}25`,
		});
		await insertFixed({
			id: yearly,
			internalProductId: fullPro.internal_id,
			createdAt: now + 10,
			amount: 25,
			interval: BillingInterval.Year,
			stripePriceId: "price_year_25",
		});
		await insertFixed({
			id: usdOnly,
			internalProductId: fullPro.internal_id,
			createdAt: now + 20,
			amount: 25,
			stripePriceId: "price_usd_only",
		});
		await insertFixed({
			id: usdEur,
			internalProductId: fullPro.internal_id,
			createdAt: now + 30,
			amount: 25,
			stripePriceId: "price_usd_from_fx",
			currencies: { eur: { amount: 25, stripe_price_id: "price_eur_25" } },
		});
		await insertFixed({
			id: otherPlan,
			internalProductId: fullPremium.internal_id,
			createdAt: now + 40,
			amount: 25,
			stripePriceId: "price_prem_25",
		});
		await insertFixed({
			id: catalog,
			internalProductId: fullPro.internal_id,
			createdAt: now - 200,
			amount: 25,
			stripePriceId: "price_catalog_25",
			isCustom: false,
		});

		const find = ({
			target,
			productId = pro.id,
			targetCurrency = "usd",
		}: {
			target: Price;
			productId?: string;
			targetCurrency?: string;
		}) =>
			priceRepo.findNewestReusableFixedPrice({
				ctx,
				targetPrice: target,
				productId,
				targetCurrency,
			});

		const target25 = targetFixed({ amount: 25 });

		expect((await find({ target: target25 }))?.id).toBe(usdEur);
		expect(
			(await find({ target: { ...target25, id: usdEur } }))?.id,
		).toBe(usdOnly);

		expect(
			await find({
				target: targetFixed({ amount: 25, interval: BillingInterval.Year }),
			}),
		).toMatchObject({ id: yearly });
		expect(await find({ target: targetFixed({ amount: 20 }) })).toBeNull();

		expect(
			(
				await find({
					target: targetFixed({
						amount: 25,
						currencies: { eur: { amount: 25 } },
					}),
					targetCurrency: "eur",
				})
			)?.id,
		).toBe(usdEur);
		expect(
			await find({
				target: {
					...targetFixed({
						amount: 25,
						currencies: { eur: { amount: 25 } },
					}),
					id: usdEur,
				},
				targetCurrency: "eur",
			}),
		).toBeNull();

		expect(
			(await find({ target: target25, productId: premium.id }))?.id,
		).toBe(otherPlan);

		expect(
			(await find({ target: { ...target25, is_custom: false } }))?.id,
		).toBe(catalog);
		expect(
			(
				await find({
					target: { ...target25, is_custom: true, id: catalog },
				})
			)?.id,
		).toBe(usdEur);
	},
);
