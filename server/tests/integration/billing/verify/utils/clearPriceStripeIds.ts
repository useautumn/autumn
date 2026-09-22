import {
	findPriceByFeatureId,
	type Price,
	prices as pricesTable,
} from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService";

/** Nulls the given Stripe id slots on a product's price config — simulates a
 * price that was never materialized in Stripe. Returns the old Stripe ids. */
export const clearPriceStripeIds = async ({
	ctx,
	productId,
	featureId,
	slots,
}: {
	ctx: TestContext;
	productId: string;
	featureId?: string;
	slots: string[];
}): Promise<string[]> => {
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: productId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const price = featureId
		? findPriceByFeatureId({ prices: fullProduct.prices, featureId })
		: fullProduct.prices.find((candidate) => !candidate.config.feature_id);
	if (!price) throw new Error(`No matching price on product ${productId}`);

	const config = { ...(price.config as unknown as Record<string, unknown>) };
	const clearedIds: string[] = [];
	for (const slot of slots) {
		if (typeof config[slot] === "string") clearedIds.push(config[slot]);
		config[slot] = null;
	}
	await ctx.db
		.update(pricesTable)
		.set({ config: config as Price["config"] })
		.where(eq(pricesTable.id, price.id));
	return clearedIds;
};
