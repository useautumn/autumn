import {
	type AppEnv,
	isFixedPrice,
	orgToCurrency,
	type Price,
	priceConfigForCurrency,
	prices,
	PriceType,
	products,
} from "@autumn/shared";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { liveProductWhere } from "@/internal/products/repos/liveProductWhere.js";
import { composeAttachCurrencyFixedMatch } from "./utils/composeAttachCurrencyFixedMatch.js";
import { composeReusableCustomScope } from "./utils/composeReusableCustomScope.js";

export const composeNewestReusableFixedPriceQuery = ({
	db,
	orgId,
	env,
	productId,
	excludePriceId,
	targetIsCustom,
	targetCurrency,
	orgDefaultCurrency,
	amount,
	interval,
	intervalCount,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	productId: string;
	excludePriceId: string;
	targetIsCustom: boolean;
	targetCurrency: string;
	orgDefaultCurrency: string;
	amount: number;
	interval: string;
	intervalCount: number;
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
				sql`${prices.config} ->> 'type' = ${PriceType.Fixed}`,
				sql`${prices.config} ->> 'interval' = ${interval}`,
				sql`COALESCE((${prices.config} ->> 'interval_count')::int, 1) = ${intervalCount}`,
				composeAttachCurrencyFixedMatch({
					targetCurrency,
					orgDefaultCurrency,
					amount,
				}),
			),
		)
		.orderBy(desc(prices.created_at))
		.limit(1);

export const findNewestReusableFixedPrice = async ({
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
	if (!isFixedPrice(targetPrice)) return null;

	const orgDefaultCurrency = orgToCurrency({ org: ctx.org }).toLowerCase();
	const { amount } = priceConfigForCurrency({
		config: targetPrice.config,
		currency: targetCurrency,
		orgDefault: orgDefaultCurrency,
	});
	if (amount == null) return null;

	const rows = await composeNewestReusableFixedPriceQuery({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		productId,
		excludePriceId: targetPrice.id,
		targetIsCustom: targetPrice.is_custom === true,
		targetCurrency,
		orgDefaultCurrency,
		amount,
		interval: targetPrice.config.interval,
		intervalCount: targetPrice.config.interval_count ?? 1,
	});

	return (rows[0]?.price as Price | undefined) ?? null;
};
