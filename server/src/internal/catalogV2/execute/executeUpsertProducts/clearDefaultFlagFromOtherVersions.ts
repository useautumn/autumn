import { products } from "@autumn/shared";
import { and, eq, ne } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** When a version becomes default, clear is_default on siblings of the same plan id. */
export const clearDefaultFlagFromOtherVersions = async ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: { id: string; internal_id: string; is_default: boolean };
}) => {
	if (!product.is_default) return;

	await ctx.db
		.update(products)
		.set({ is_default: false })
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, product.id),
				ne(products.internal_id, product.internal_id),
				eq(products.is_default, true),
			),
		);
};
