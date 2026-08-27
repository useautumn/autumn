/**
 * findReusableStripeResources (fixed only).
 *
 * Contract:
 *   $25/$25 same Pro → stamp donor stripe_price_id
 *   amount or interval mismatch → null
 *   USD-only vs USD+EUR, USD attach → copy USD slot only
 *   EUR attach, USD slot only → null
 *   other product.id / org / env → null
 *   same product.id across versions → match
 *   catalog cannot reuse custom; custom can reuse catalog
 *   usage candidate → null
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillWhen,
	type FixedPriceConfig,
	getPriceCurrencyStripeId,
	type Price,
	PriceType,
	TierInfinite,
	type UsagePriceConfig,
} from "@autumn/shared";
import { findReusableStripeResources } from "@/internal/products/stripeResourceUtils/findReusableStripeResources/findReusableStripeResources.js";
import type {
	StripeReuseCandidate,
	StripeReuseProductRef,
} from "@/internal/products/stripeResourceUtils/findReusableStripeResources/types/stripeReuseCandidate.js";

const orgDefaultCurrency = "usd";
const now = 1_800_000_000_000;

const pro: StripeReuseProductRef = {
	id: "pro",
	org_id: "org_1",
	env: AppEnv.Sandbox,
};

const fixedConfig = (
	overrides: Partial<FixedPriceConfig> = {},
): FixedPriceConfig => ({
	type: PriceType.Fixed,
	amount: 25,
	interval: BillingInterval.Month,
	interval_count: 1,
	stripe_product_id: null,
	feature_id: null,
	internal_feature_id: null,
	...overrides,
});

const fixedPrice = ({
	id,
	isCustom = false,
	createdAt = now,
	config,
}: {
	id: string;
	isCustom?: boolean;
	createdAt?: number;
	config?: Partial<FixedPriceConfig>;
}): Price => ({
	id,
	org_id: pro.org_id,
	created_at: createdAt,
	internal_product_id: "ip_pro",
	is_custom: isCustom,
	config: fixedConfig(config),
	proration_config: null,
});

const candidate = ({
	price,
	product = pro,
}: {
	price: Price;
	product?: StripeReuseProductRef;
}): StripeReuseCandidate => ({ price, product });

const find = ({
	target,
	candidates,
	currency = "usd",
	product = pro,
}: {
	target: Price;
	candidates: StripeReuseCandidate[];
	currency?: string;
	product?: StripeReuseProductRef;
}) =>
	findReusableStripeResources({
		targetPrice: target,
		targetProduct: product,
		candidates,
		currency,
		orgDefaultCurrency,
	});

const usagePrice = (): Price => ({
	id: "pr_usage",
	org_id: pro.org_id,
	created_at: now,
	internal_product_id: "ip_pro",
	is_custom: true,
	config: {
		type: PriceType.Usage,
		bill_when: BillWhen.EndOfPeriod,
		billing_units: 1,
		internal_feature_id: "feat_messages",
		feature_id: "messages",
		usage_tiers: [{ amount: 25, to: TierInfinite }],
		interval: BillingInterval.Month,
		interval_count: 1,
		stripe_price_id: "price_usage_25",
	} satisfies UsagePriceConfig,
	proration_config: null,
});

describe("findReusableStripeResources — fixed", () => {
	test("same $25 monthly on Pro stamps the donor stripe_price_id", () => {
		const target = fixedPrice({ id: "pr_b", isCustom: true });
		const donor = fixedPrice({
			id: "pr_a",
			isCustom: true,
			config: { stripe_price_id: "price_25" },
		});
		donor.internal_product_id = "ip_pro_v1";

		expect(find({ target, candidates: [candidate({ price: donor })] })?.id).toBe(
			"pr_a",
		);
		expect(
			getPriceCurrencyStripeId({
				config: target.config,
				currency: "usd",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBe("price_25");
	});

	test("amount or interval mismatch does not match", () => {
		const target = fixedPrice({ id: "pr_b" });
		const cheaper = fixedPrice({
			id: "pr_20",
			config: { amount: 20, stripe_price_id: "price_20" },
		});
		const yearly = fixedPrice({
			id: "pr_year",
			config: { interval: BillingInterval.Year, stripe_price_id: "price_year" },
		});

		expect(find({ target, candidates: [candidate({ price: cheaper })] })).toBeNull();
		expect(find({ target, candidates: [candidate({ price: yearly })] })).toBeNull();
		expect(target.config.stripe_price_id).toBeFalsy();
	});

	test("USD attach on USD+EUR copies the USD slot only", () => {
		const target = fixedPrice({
			id: "pr_b",
			isCustom: true,
			config: {
				currencies: { eur: { amount: 25 } },
			},
		});
		const eurTarget = fixedPrice({
			id: "pr_b_eur",
			isCustom: true,
			config: {
				currencies: { eur: { amount: 25 } },
			},
		});
		const donor = fixedPrice({
			id: "pr_a",
			isCustom: true,
			config: {
				stripe_price_id: "price_usd",
				currencies: { eur: { amount: 25, stripe_price_id: "price_eur" } },
			},
		});

		expect(find({ target, candidates: [candidate({ price: donor })] })?.id).toBe(
			"pr_a",
		);
		expect(
			getPriceCurrencyStripeId({
				config: target.config,
				currency: "usd",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBe("price_usd");
		expect(
			getPriceCurrencyStripeId({
				config: target.config,
				currency: "eur",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBeUndefined();

		expect(
			find({
				target: eurTarget,
				candidates: [candidate({ price: donor })],
				currency: "eur",
			})?.id,
		).toBe("pr_a");
		expect(
			getPriceCurrencyStripeId({
				config: eurTarget.config,
				currency: "eur",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBe("price_eur");
		expect(
			getPriceCurrencyStripeId({
				config: eurTarget.config,
				currency: "usd",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBeUndefined();
	});

	test("EUR attach with only a USD slot does not match", () => {
		const target = fixedPrice({
			id: "pr_b",
			isCustom: true,
			config: { currencies: { eur: { amount: 25 } } },
		});
		const usdOnly = fixedPrice({
			id: "pr_a",
			isCustom: true,
			config: { stripe_price_id: "price_usd" },
		});

		expect(
			find({
				target,
				candidates: [candidate({ price: usdOnly })],
				currency: "eur",
			}),
		).toBeNull();
		expect(
			getPriceCurrencyStripeId({
				config: target.config,
				currency: "eur",
				orgDefault: orgDefaultCurrency,
				slot: "stripe_price_id",
			}),
		).toBeUndefined();
	});

	test("other product.id, org, or env does not match", () => {
		const target = fixedPrice({ id: "pr_b" });
		const donor = fixedPrice({
			id: "pr_a",
			config: { stripe_price_id: "price_25" },
		});

		expect(
			find({
				target,
				candidates: [
					candidate({
						price: donor,
						product: { ...pro, id: "premium" },
					}),
				],
			}),
		).toBeNull();
		expect(
			find({
				target,
				candidates: [
					candidate({
						price: donor,
						product: { ...pro, org_id: "org_other" },
					}),
				],
			}),
		).toBeNull();
		expect(
			find({
				target,
				candidates: [
					candidate({
						price: donor,
						product: { ...pro, env: AppEnv.Live },
					}),
				],
			}),
		).toBeNull();
	});

	test("catalog cannot reuse custom; custom can reuse catalog", () => {
		const olderCustom = fixedPrice({
			id: "pr_old",
			isCustom: true,
			createdAt: now - 100,
			config: { stripe_price_id: "price_old" },
		});
		const newerCustom = fixedPrice({
			id: "pr_new",
			isCustom: true,
			createdAt: now,
			config: { stripe_price_id: "price_new" },
		});
		const catalog = fixedPrice({
			id: "pr_cat",
			createdAt: now - 200,
			config: { stripe_price_id: "price_cat" },
		});

		expect(
			find({
				target: fixedPrice({ id: "pr_catalog" }),
				candidates: [
					candidate({ price: olderCustom }),
					candidate({ price: newerCustom }),
				],
			}),
		).toBeNull();
		expect(
			find({
				target: fixedPrice({ id: "pr_catalog_mix" }),
				candidates: [
					candidate({ price: newerCustom }),
					candidate({ price: catalog }),
				],
			})?.id,
		).toBe("pr_cat");
		expect(
			find({
				target: fixedPrice({ id: "pr_custom_mix", isCustom: true }),
				candidates: [
					candidate({ price: newerCustom }),
					candidate({ price: catalog }),
				],
			})?.id,
		).toBe("pr_cat");
		expect(
			find({
				target: fixedPrice({ id: "pr_custom_only", isCustom: true }),
				candidates: [
					candidate({ price: olderCustom }),
					candidate({ price: newerCustom }),
				],
			})?.id,
		).toBe("pr_new");
	});

	test("usage target or candidate is ignored", () => {
		const target = fixedPrice({ id: "pr_b" });
		expect(
			find({
				target,
				candidates: [candidate({ price: usagePrice() })],
			}),
		).toBeNull();
		expect(
			find({
				target: usagePrice(),
				candidates: [
					candidate({
						price: fixedPrice({
							id: "pr_a",
							config: { stripe_price_id: "price_25" },
						}),
					}),
				],
			}),
		).toBeNull();
	});
});
