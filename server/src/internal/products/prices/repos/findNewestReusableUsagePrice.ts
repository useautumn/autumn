import {
	type AppEnv,
	BillWhen,
	isAllocatedV2Price,
	isConsumablePrice,
	orgToCurrency,
	type Price,
	prices,
	pricesAreSame,
	PriceType,
	products,
	type UsagePriceConfig,
} from "@autumn/shared";
import { and, eq, ne, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { liveProductWhere } from "@/internal/products/repos/liveProductWhere.js";
import { composeAttachCurrencyUsageStripeSlot } from "./utils/composeAttachCurrencyUsageStripeSlot.js";
import { composeConfigTextEquals } from "./utils/composeConfigTextEquals.js";
import { composeReusableCustomScope } from "./utils/composeReusableCustomScope.js";
import { composeReusablePriceRankOrder } from "./utils/composeReusablePriceRankOrder.js";

const USAGE_REUSE_CANDIDATE_LIMIT = 1000;

export const composeNewestReusableUsagePriceQuery = ({
	db,
	orgId,
	env,
	productId,
	excludePriceId,
	targetIsCustom,
	targetCurrency,
	orgDefaultCurrency,
	featureId,
	internalFeatureId,
	billWhen,
	interval,
	intervalCount,
	billingUnits,
	shouldProrate,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	productId: string;
	excludePriceId: string;
	targetIsCustom: boolean;
	targetCurrency: string;
	orgDefaultCurrency: string;
	featureId: string | null | undefined;
	internalFeatureId: string | null | undefined;
	billWhen: string;
	interval: string | null | undefined;
	intervalCount: number;
	billingUnits: number;
	shouldProrate: boolean;
}) =>
	db
		.select({ price: prices })
		.from(prices)
		.innerJoin(products, eq(prices.internal_product_id, products.internal_id))
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				eq(products.id, productId),
				liveProductWhere,
				ne(prices.id, excludePriceId),
				composeReusableCustomScope({ targetIsCustom }),
				sql`${prices.config} ->> 'type' = ${PriceType.Usage}`,
				composeConfigTextEquals({ key: "feature_id", value: featureId }),
				composeConfigTextEquals({
					key: "internal_feature_id",
					value: internalFeatureId,
				}),
				composeConfigTextEquals({ key: "bill_when", value: billWhen }),
				composeConfigTextEquals({ key: "interval", value: interval }),
				sql`COALESCE((${prices.config} ->> 'interval_count')::int, 1) = ${intervalCount}`,
				sql`COALESCE((${prices.config} ->> 'billing_units')::numeric, 1) = ${billingUnits}`,
				sql`COALESCE((${prices.config} ->> 'should_prorate')::boolean, false) = ${shouldProrate}`,
				composeAttachCurrencyUsageStripeSlot({
					targetCurrency,
					orgDefaultCurrency,
					slot: "stripe_price_id",
				}),
			),
		)
		.orderBy(...composeReusablePriceRankOrder())
		.limit(USAGE_REUSE_CANDIDATE_LIMIT);

export const findNewestReusableUsagePrice = async ({
	ctx,
	targetPrice,
	productId,
	targetCurrency,
}: {
	ctx: AutumnContext;
	targetPrice: Price;
	productId: string;
	targetCurrency: string;
}): Promise<Price | null> => {
	if (!isConsumablePrice(targetPrice) && !isAllocatedV2Price(targetPrice)) {
		return null;
	}

	const config = targetPrice.config as UsagePriceConfig;
	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();

	const rows = await composeNewestReusableUsagePriceQuery({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		productId,
		excludePriceId: targetPrice.id,
		targetIsCustom: targetPrice.is_custom === true,
		targetCurrency,
		orgDefaultCurrency,
		featureId: config.feature_id,
		internalFeatureId: config.internal_feature_id,
		billWhen: config.bill_when ?? BillWhen.EndOfPeriod,
		interval: config.interval,
		intervalCount: config.interval_count ?? 1,
		billingUnits: config.billing_units ?? 1,
		shouldProrate: config.should_prorate ?? false,
	});

	for (const row of rows) {
		const candidate = row.price as Price;
		if (pricesAreSame(targetPrice, candidate)) return candidate;
	}

	return null;
};
