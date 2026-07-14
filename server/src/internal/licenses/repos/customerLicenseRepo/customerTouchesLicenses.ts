import { customerLicenses, customers, type FullCustomer } from "@autumn/shared";
import { and, eq, or, sql } from "drizzle-orm";
import type { RepoContext } from "@/db/repoContext.js";

/**
 * Does this customer have any customer licenses? They are the source of
 * truth for license involvement — no rows means nothing to assign, list, or
 * reconcile. In-memory when a fullCustomer is at hand, else one indexed read.
 */
export const customerTouchesLicenses = async ({
	ctx,
	idOrInternalId,
	fullCustomer,
}: {
	ctx: RepoContext;
	idOrInternalId?: string;
	fullCustomer?: FullCustomer;
}): Promise<boolean> => {
	if (fullCustomer) {
		return (
			fullCustomer.customer_licenses.length > 0 ||
			fullCustomer.customer_products.some(
				(customerProduct) =>
					(customerProduct.customer_licenses?.length ?? 0) > 0,
			)
		);
	}
	if (!idOrInternalId) return false;

	const rows = await ctx.db
		.select({ one: sql<number>`1` })
		.from(customerLicenses)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerLicenses.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, ctx.org.id),
				eq(customers.env, ctx.env),
				or(
					eq(customers.internal_id, idOrInternalId),
					eq(customers.id, idOrInternalId),
				),
			),
		)
		.limit(1);
	return rows.length > 0;
};
