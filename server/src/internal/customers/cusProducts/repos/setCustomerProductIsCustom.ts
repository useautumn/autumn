import { customerProducts } from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";
import { markCustomersUpdatedAtByInternalIds } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

/** Compare-and-set, so a flag another write changed since it was read is left alone. Returns whether it was written. */
export const setCustomerProductIsCustom = async ({
	ctx,
	internalCustomerId,
	customerProductId,
	from,
	to,
}: {
	ctx: RepoContext;
	internalCustomerId: string;
	customerProductId: string;
	from: boolean;
	to: boolean;
}): Promise<boolean> => {
	const written = await ctx.db
		.update(customerProducts)
		.set({ is_custom: to, updated_at: Date.now() })
		.where(
			and(
				eq(customerProducts.id, customerProductId),
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerProducts.is_custom, from),
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
