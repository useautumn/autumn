import { expect } from "bun:test";
import { prices } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { and, eq, inArray } from "drizzle-orm";

type PriceConfigWithStripeProduct = {
	stripe_product_id?: string | null;
};

type PriceConfigWithStripeResources = {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
};

export const expectPreparedStripeProductCount = async ({
	ctx,
	priceIds,
	count,
}: {
	ctx: AutumnContext;
	priceIds: string[];
	count: number;
}) => {
	const rows = await ctx.db
		.select({
			id: prices.id,
			config: prices.config,
		})
		.from(prices)
		.where(and(eq(prices.org_id, ctx.org.id), inArray(prices.id, priceIds)));

	expect(rows.length).toBe(priceIds.length);

	const stripeProductIds = new Set(
		rows
			.map(
				(row) => (row.config as PriceConfigWithStripeProduct).stripe_product_id,
			)
			.filter((stripeProductId): stripeProductId is string =>
				Boolean(stripeProductId),
			),
	);

	expect(stripeProductIds.size).toBe(count);

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	for (const stripeProductId of stripeProductIds) {
		const stripeProduct = await stripeCli.products.retrieve(stripeProductId);
		expect(stripeProduct.id).toBe(stripeProductId);
	}

	return stripeProductIds;
};

/**
 * Asserts every prepared price row for `priceIds` shares the SAME Stripe
 * price (and, for prepaid volume-tiered items, the same v2 prepaid price) —
 * one real Stripe price object created and reused across every matched
 * catalog product version, not one per version.
 */
export const expectPreparedStripePriceReused = async ({
	ctx,
	priceIds,
}: {
	ctx: AutumnContext;
	priceIds: string[];
}) => {
	const rows = await ctx.db
		.select({
			id: prices.id,
			config: prices.config,
		})
		.from(prices)
		.where(and(eq(prices.org_id, ctx.org.id), inArray(prices.id, priceIds)));

	expect(rows.length).toBe(priceIds.length);

	const configs = rows.map((row) => row.config as PriceConfigWithStripeResources);

	const stripePriceIds = new Set(
		configs
			.map((config) => config.stripe_price_id)
			.filter((id): id is string => Boolean(id)),
	);
	const stripePrepaidV2Ids = new Set(
		configs
			.map((config) => config.stripe_prepaid_price_v2_id)
			.filter((id): id is string => Boolean(id)),
	);

	expect(stripePriceIds.size).toBe(1);
	expect(stripePrepaidV2Ids.size).toBe(1);

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const [stripePriceId] = stripePriceIds;
	const stripePrice = await stripeCli.prices.retrieve(stripePriceId);
	expect(stripePrice.id).toBe(stripePriceId);

	const [stripePrepaidV2Id] = stripePrepaidV2Ids;
	const stripePrepaidV2Price = await stripeCli.prices.retrieve(stripePrepaidV2Id);
	expect(stripePrepaidV2Price.id).toBe(stripePrepaidV2Id);

	return { stripePriceId, stripePrepaidV2Id };
};
