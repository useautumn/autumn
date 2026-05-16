import { expect } from "bun:test";
import { prices } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { and, eq, inArray } from "drizzle-orm";

type PriceConfigWithStripeProduct = {
	stripe_product_id?: string | null;
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
