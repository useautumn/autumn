import {
	type AppEnv,
	type Price,
	ProcessorType,
	prices,
	products,
} from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { clearDependentStripePriceFields } from "./catalogMappingUtils.js";

export const clearStripeCatalogMappings = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}) => {
	const catalogProducts = await db.query.products.findMany({
		where: and(eq(products.org_id, orgId), eq(products.env, env)),
		with: { prices: true },
	});

	await db
		.update(products)
		.set({ processor: null })
		.where(
			and(
				eq(products.org_id, orgId),
				eq(products.env, env),
				sql`${products.processor} ->> 'type' = ${ProcessorType.Stripe}`,
			),
		);

	for (const product of catalogProducts) {
		for (const price of product.prices) {
			await db
				.update(prices)
				.set({
					config: clearDependentStripePriceFields({
						price: price as Price,
						stripeProductId: null,
					}),
				})
				.where(eq(prices.id, price.id));
		}
	}
};
