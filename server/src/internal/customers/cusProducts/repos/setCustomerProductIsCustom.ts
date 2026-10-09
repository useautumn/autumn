import { customerProducts } from "@autumn/shared";
import { and, eq, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

export const setCustomerProductIsCustom = async ({
	ctx,
	internalCustomerId,
	customerProductId,
	from,
	to,
	readUpdatedAt,
}: {
	ctx: RepoContext;
	internalCustomerId: string;
	customerProductId: string;
	from: boolean;
	to: boolean;
	readUpdatedAt: number | null;
}): Promise<boolean> => {
	const written = await ctx.db
		.update(customerProducts)
		.set({ is_custom: to, updated_at: Date.now() })
		.where(
			and(
				eq(customerProducts.id, customerProductId),
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerProducts.is_custom, from),
				sql`${customerProducts.updated_at} IS NOT DISTINCT FROM ${readUpdatedAt}`,
			),
		)
		.returning({ id: customerProducts.id });

	if (written.length === 0) return false;
	await markCustomersUpdatedAtByInternalIds({
		db: ctx.db,
		internalCustomerIds: [internalCustomerId],
	});
	return true;
};
