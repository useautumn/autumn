/**
 * findNewestReusableUsagePrice
 *
 * SQL is a coarse filter. The winner is the newest row that pricesAreSame
 * accepts — including 0 / null / undefined / inf vs -1 tier aliases.
 *
 * Contract:
 *   newest matching consumable with a usable stripe slot wins
 *   amount 0 is a real tier; flat_amount unset equals 0
 *   last-tier `to` inf aliases -1; mid-tier `to` is compared
 *   billing_units null / undefined / 1 are equivalent
 *   feature_id, prepaid, preview, self, other product.id → no
 *   catalog cannot reuse custom; custom can reuse catalog
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	PREVIEW_STRIPE_PRICE_ID_PREFIX,
	type Price,
	PriceType,
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

const targetUsage = ({
	amount = 2,
	featureId = "messages",
	internalFeatureId = "ifeat_messages",
	billingUnits,
	usageTiers,
	billWhen = BillWhen.EndOfPeriod,
	interval = BillingInterval.Month,
	intervalCount = 1,
	shouldProrate = false,
	currencies,
}: {
	amount?: number;
	featureId?: string;
	internalFeatureId?: string;
	billingUnits?: number | null;
	usageTiers?: UsageTier[];
	billWhen?: BillWhen;
	interval?: BillingInterval;
	intervalCount?: number;
	shouldProrate?: boolean;
	currencies?: UsagePriceConfig["currencies"];
}): Price => ({
	id: generateId("pr"),
	org_id: "unused",
	created_at: Date.now(),
	internal_product_id: "unused",
	is_custom: true,
	config: {
		type: PriceType.Usage,
		bill_when: billWhen,
		billing_units: billingUnits === undefined ? 1 : billingUnits,
		internal_feature_id: internalFeatureId,
		feature_id: featureId,
		usage_tiers: usageTiers ?? [{ amount, to: TierInfinite }],
		interval,
		interval_count: intervalCount,
		should_prorate: shouldProrate,
		...(currencies ? { currencies } : {}),
	},
	proration_config: null,
});

test.concurrent(
	`${chalk.yellowBright("priceRepo: findNewestReusableUsagePrice")}`,
	async () => {
		const suffix = uniqueSuffix();
		const pro = products.pro({ id: `fnru-pro-${suffix}`, items: [] });
		const premium = products.premium({
			id: `fnru-prem-${suffix}`,
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

		const insertUsage = async ({
			id,
			internalProductId,
			createdAt,
			amount = 2,
			featureId = "messages",
			internalFeatureId = "ifeat_messages",
			billingUnits,
			usageTiers,
			billWhen = BillWhen.EndOfPeriod,
			stripePriceId,
			currencies,
			isCustom = true,
		}: {
			id: string;
			internalProductId: string;
			createdAt: number;
			amount?: number;
			featureId?: string;
			internalFeatureId?: string;
			billingUnits?: number | null;
			usageTiers?: UsageTier[];
			billWhen?: BillWhen;
			stripePriceId?: string | null;
			currencies?: UsagePriceConfig["currencies"];
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
						type: PriceType.Usage,
						bill_when: billWhen,
						...(billingUnits === undefined ? {} : { billing_units: billingUnits }),
						internal_feature_id: internalFeatureId,
						feature_id: featureId,
						usage_tiers: usageTiers ?? [{ amount, to: TierInfinite }],
						interval: BillingInterval.Month,
						interval_count: 1,
						should_prorate: false,
						stripe_price_id: stripePriceId,
						...(currencies ? { currencies } : {}),
					},
					proration_config: null,
				},
			});
		};

		const older = generateId("pr");
		const newer = generateId("pr");
		const preview = generateId("pr");
		const zeroAmount = generateId("pr");
		const flatUnset = generateId("pr");
		const infAlias = generateId("pr");
		const unitsNull = generateId("pr");
		const unitsHundred = generateId("pr");
		const midTier = generateId("pr");
		const otherFeature = generateId("pr");
		const prepaid = generateId("pr");
		const usdEur = generateId("pr");
		const otherPlan = generateId("pr");
		const catalog = generateId("pr");
		const now = Date.now();

		await insertUsage({
			id: older,
			internalProductId: fullPro.internal_id,
			createdAt: now - 100,
			amount: 2,
			stripePriceId: "price_old_2",
		});
		await insertUsage({
			id: newer,
			internalProductId: fullPro.internal_id,
			createdAt: now,
			amount: 2,
			stripePriceId: "price_new_2",
		});
		await insertUsage({
			id: preview,
			internalProductId: fullPro.internal_id,
			createdAt: now + 50,
			amount: 2,
			stripePriceId: `${PREVIEW_STRIPE_PRICE_ID_PREFIX}2`,
		});
		await insertUsage({
			id: zeroAmount,
			internalProductId: fullPro.internal_id,
			createdAt: now + 10,
			amount: 0,
			stripePriceId: "price_zero",
		});
		await insertUsage({
			id: flatUnset,
			internalProductId: fullPro.internal_id,
			createdAt: now + 20,
			usageTiers: [{ amount: 2, to: TierInfinite, flat_amount: 0 }],
			stripePriceId: "price_flat0",
		});
		await insertUsage({
			id: infAlias,
			internalProductId: fullPro.internal_id,
			createdAt: now + 30,
			usageTiers: [{ amount: 2, to: -1 }],
			stripePriceId: "price_inf_alias",
		});
		await insertUsage({
			id: unitsNull,
			internalProductId: fullPro.internal_id,
			createdAt: now + 40,
			billingUnits: null,
			amount: 2,
			stripePriceId: "price_units_null",
		});
		await insertUsage({
			id: unitsHundred,
			internalProductId: fullPro.internal_id,
			createdAt: now + 45,
			billingUnits: 100,
			amount: 2,
			stripePriceId: "price_units_100",
		});
		await insertUsage({
			id: midTier,
			internalProductId: fullPro.internal_id,
			createdAt: now + 55,
			usageTiers: [
				{ to: 100, amount: 1 },
				{ to: TierInfinite, amount: 2 },
			],
			stripePriceId: "price_mid_tier",
		});
		await insertUsage({
			id: otherFeature,
			internalProductId: fullPro.internal_id,
			createdAt: now + 60,
			featureId: "words",
			internalFeatureId: "ifeat_words",
			amount: 2,
			stripePriceId: "price_words_2",
		});
		await insertUsage({
			id: prepaid,
			internalProductId: fullPro.internal_id,
			createdAt: now + 70,
			billWhen: BillWhen.InAdvance,
			amount: 2,
			stripePriceId: "price_prepaid_2",
		});
		await insertUsage({
			id: usdEur,
			internalProductId: fullPro.internal_id,
			createdAt: now + 80,
			amount: 2,
			stripePriceId: "price_usd_from_fx",
			currencies: { eur: { stripe_price_id: "price_eur_2" } },
		});
		await insertUsage({
			id: otherPlan,
			internalProductId: fullPremium.internal_id,
			createdAt: now + 90,
			amount: 2,
			stripePriceId: "price_prem_2",
		});
		await insertUsage({
			id: catalog,
			internalProductId: fullPro.internal_id,
			createdAt: now - 200,
			amount: 2,
			stripePriceId: "price_catalog_2",
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
			priceRepo.findNewestReusableUsagePrice({
				ctx,
				targetPrice: target,
				productId,
				targetCurrency,
			});

		const target2 = targetUsage({ amount: 2 });

		expect((await find({ target: target2 }))?.id).toBe(usdEur);
		expect((await find({ target: { ...target2, id: usdEur } }))?.id).toBe(
			unitsNull,
		);

		expect(await find({ target: targetUsage({ amount: 0 }) })).toMatchObject({
			id: zeroAmount,
		});
		expect(
			await find({
				target: targetUsage({
					usageTiers: [{ amount: 2, to: TierInfinite, flat_amount: 0 }],
				}),
			}),
		).toMatchObject({ id: usdEur });
		expect(
			await find({
				target: targetUsage({ usageTiers: [{ amount: 2, to: -1 }] }),
			}),
		).toMatchObject({ id: usdEur });

		expect(
			await find({ target: targetUsage({ amount: 2, billingUnits: null }) }),
		).toMatchObject({ id: usdEur });
		expect(
			await find({
				target: targetUsage({ amount: 2, billingUnits: undefined }),
			}),
		).toMatchObject({ id: usdEur });
		expect(
			await find({ target: targetUsage({ amount: 2, billingUnits: 100 }) }),
		).toMatchObject({ id: unitsHundred });

		expect(
			await find({
				target: targetUsage({
					usageTiers: [
						{ to: 200, amount: 1 },
						{ to: TierInfinite, amount: 2 },
					],
				}),
			}),
		).toBeNull();
		expect(
			await find({
				target: targetUsage({
					usageTiers: [
						{ to: 100, amount: 1 },
						{ to: TierInfinite, amount: 2 },
					],
				}),
			}),
		).toMatchObject({ id: midTier });

		expect(
			await find({
				target: targetUsage({
					featureId: "words",
					internalFeatureId: "ifeat_words",
				}),
			}),
		).toMatchObject({ id: otherFeature });
		expect(
			await find({
				target: targetUsage({ billWhen: BillWhen.InAdvance }),
			}),
		).toBeNull();

		expect(
			(
				await find({
					target: targetUsage({
						amount: 2,
						currencies: { eur: {} },
					}),
					targetCurrency: "eur",
				})
			)?.id,
		).toBe(usdEur);

		expect((await find({ target: target2, productId: premium.id }))?.id).toBe(
			otherPlan,
		);

		expect(
			(
				await find({
					target: { ...target2, is_custom: false },
				})
			)?.id,
		).toBe(catalog);
		expect(
			(
				await find({
					target: { ...target2, is_custom: true, id: catalog },
				})
			)?.id,
		).toBe(usdEur);
	},
);
