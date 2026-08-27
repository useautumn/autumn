/**
 * findNewestReusablePrepaidPrice
 *
 * SQL is a coarse filter. The winner is the newest row that pricesAreSame
 * accepts. Slot is stripe_prepaid_price_v2_id only.
 *
 * Contract:
 *   newest matching prepaid with a usable V2 slot wins
 *   volume vs graduated → no
 *   flat_amount 50 vs unset/0 → no
 *   consumable, one-off, V1-only, preview, other product.id → no
 *   catalog cannot reuse custom; custom can reuse catalog
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	PREVIEW_STRIPE_PRICE_ID_PREFIX,
	type Price,
	PriceType,
	TierBehavior,
	TierInfinite,
	type UsagePriceConfig,
	type UsageTier,
} from "@autumn/shared";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { priceRepo } from "@/internal/products/prices/repos/priceRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueSuffix } from "./feature-products/utils/createUnmintedFeaturePlans.js";

const targetPrepaid = ({
	amount = 10,
	featureId = "messages",
	internalFeatureId = "ifeat_messages",
	billingUnits = 100,
	usageTiers,
	billWhen = BillWhen.InAdvance,
	interval = BillingInterval.Month,
	intervalCount = 1,
	tierBehavior,
	isCustom = true,
	currencies,
}: {
	amount?: number;
	featureId?: string;
	internalFeatureId?: string;
	billingUnits?: number;
	usageTiers?: UsageTier[];
	billWhen?: BillWhen;
	interval?: BillingInterval;
	intervalCount?: number;
	tierBehavior?: TierBehavior;
	isCustom?: boolean;
	currencies?: UsagePriceConfig["currencies"];
}): Price => ({
	id: generateId("pr"),
	org_id: "unused",
	created_at: Date.now(),
	internal_product_id: "unused",
	is_custom: isCustom,
	tier_behavior: tierBehavior,
	config: {
		type: PriceType.Usage,
		bill_when: billWhen,
		billing_units: billingUnits,
		internal_feature_id: internalFeatureId,
		feature_id: featureId,
		usage_tiers: usageTiers ?? [{ amount, to: TierInfinite }],
		interval,
		interval_count: intervalCount,
		should_prorate: false,
		...(currencies ? { currencies } : {}),
	},
	proration_config: null,
});

test.concurrent(
	`${chalk.yellowBright("priceRepo: findNewestReusablePrepaidPrice")}`,
	async () => {
		const suffix = uniqueSuffix();
		const pro = products.pro({ id: `fnrp-pro-${suffix}`, items: [] });
		const premium = products.premium({
			id: `fnrp-prem-${suffix}`,
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

		const insertPrepaid = async ({
			id,
			internalProductId,
			createdAt,
			amount = 10,
			featureId = "messages",
			internalFeatureId = "ifeat_messages",
			billingUnits = 100,
			usageTiers,
			billWhen = BillWhen.InAdvance,
			interval = BillingInterval.Month,
			stripePrepaidPriceV2Id,
			stripePriceId,
			tierBehavior,
			isCustom = true,
		}: {
			id: string;
			internalProductId: string;
			createdAt: number;
			amount?: number;
			featureId?: string;
			internalFeatureId?: string;
			billingUnits?: number;
			usageTiers?: UsageTier[];
			billWhen?: BillWhen;
			interval?: BillingInterval;
			stripePrepaidPriceV2Id?: string | null;
			stripePriceId?: string | null;
			tierBehavior?: TierBehavior;
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
					tier_behavior: tierBehavior,
					config: {
						type: PriceType.Usage,
						bill_when: billWhen,
						billing_units: billingUnits,
						internal_feature_id: internalFeatureId,
						feature_id: featureId,
						usage_tiers: usageTiers ?? [{ amount, to: TierInfinite }],
						interval,
						interval_count: 1,
						should_prorate: false,
						stripe_price_id: stripePriceId,
						stripe_prepaid_price_v2_id: stripePrepaidPriceV2Id,
					},
					proration_config: null,
				},
			});
		};

		const older = generateId("pr");
		const newer = generateId("pr");
		const preview = generateId("pr");
		const volume = generateId("pr");
		const flat50 = generateId("pr");
		const consumable = generateId("pr");
		const v1Only = generateId("pr");
		const oneOff = generateId("pr");
		const catalog = generateId("pr");
		const otherPlan = generateId("pr");
		const now = Date.now();

		await insertPrepaid({
			id: older,
			internalProductId: fullPro.internal_id,
			createdAt: now - 100,
			stripePrepaidPriceV2Id: "price_old_v2",
		});
		await insertPrepaid({
			id: newer,
			internalProductId: fullPro.internal_id,
			createdAt: now,
			stripePrepaidPriceV2Id: "price_new_v2",
		});
		await insertPrepaid({
			id: preview,
			internalProductId: fullPro.internal_id,
			createdAt: now + 50,
			stripePrepaidPriceV2Id: `${PREVIEW_STRIPE_PRICE_ID_PREFIX}v2`,
		});
		await insertPrepaid({
			id: volume,
			internalProductId: fullPro.internal_id,
			createdAt: now + 60,
			stripePrepaidPriceV2Id: "price_volume_v2",
			tierBehavior: TierBehavior.VolumeBased,
		});
		await insertPrepaid({
			id: flat50,
			internalProductId: fullPro.internal_id,
			createdAt: now + 70,
			usageTiers: [{ amount: 10, to: TierInfinite, flat_amount: 50 }],
			stripePrepaidPriceV2Id: "price_flat50_v2",
		});
		await insertPrepaid({
			id: consumable,
			internalProductId: fullPro.internal_id,
			createdAt: now + 80,
			billWhen: BillWhen.EndOfPeriod,
			stripePrepaidPriceV2Id: "price_consumable_v2",
		});
		await insertPrepaid({
			id: v1Only,
			internalProductId: fullPro.internal_id,
			createdAt: now + 90,
			stripePriceId: "price_v1_only",
		});
		await insertPrepaid({
			id: oneOff,
			internalProductId: fullPro.internal_id,
			createdAt: now + 95,
			interval: BillingInterval.OneOff,
			stripePrepaidPriceV2Id: "price_oneoff_v2",
		});
		await insertPrepaid({
			id: catalog,
			internalProductId: fullPro.internal_id,
			createdAt: now - 200,
			stripePrepaidPriceV2Id: "price_catalog_v2",
			isCustom: false,
		});
		await insertPrepaid({
			id: otherPlan,
			internalProductId: fullPremium.internal_id,
			createdAt: now + 100,
			stripePrepaidPriceV2Id: "price_prem_v2",
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
			priceRepo.findNewestReusablePrepaidPrice({
				ctx,
				targetPrice: target,
				productId,
				targetCurrency,
			});

		const target10 = targetPrepaid({});

		expect((await find({ target: target10 }))?.id).toBe(newer);
		expect((await find({ target: { ...target10, id: newer } }))?.id).toBe(
			older,
		);

		expect(
			await find({
				target: targetPrepaid({ tierBehavior: TierBehavior.VolumeBased }),
			}),
		).toMatchObject({ id: volume });
		expect(
			await find({
				target: targetPrepaid({
					usageTiers: [{ amount: 10, to: TierInfinite, flat_amount: 50 }],
				}),
			}),
		).toMatchObject({ id: flat50 });
		expect(
			await find({
				target: targetPrepaid({
					usageTiers: [{ amount: 10, to: TierInfinite, flat_amount: 0 }],
				}),
			}),
		).toMatchObject({ id: newer });

		expect(
			await find({
				target: targetPrepaid({ billWhen: BillWhen.EndOfPeriod }),
			}),
		).toBeNull();
		expect(
			await find({
				target: targetPrepaid({ interval: BillingInterval.OneOff }),
			}),
		).toBeNull();

		expect(
			(await find({ target: target10, productId: premium.id }))?.id,
		).toBe(otherPlan);

		expect(
			(await find({ target: { ...target10, is_custom: false } }))?.id,
		).toBe(catalog);
		expect(
			(
				await find({
					target: { ...target10, is_custom: true, id: catalog },
				})
			)?.id,
		).toBe(newer);
	},
);
