import { CUSTOMER_HAS_PAID_EXISTS_SQL } from "@autumn/shared/api/migrations/compiler/registry/customerRegistry.js";
import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Has the customer ever paid an invoice with a positive total? Same predicate as the `customer.has_paid` filter. */
export const customerHasPaidInvoice = async ({
	ctx,
	internalCustomerId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
}): Promise<boolean> => {
	const rows = await ctx.db.execute<{ has_paid: boolean }>(sql`
		SELECT ${sql.raw(CUSTOMER_HAS_PAID_EXISTS_SQL)} AS has_paid
		FROM customers c
		WHERE c.internal_id = ${internalCustomerId}
	`);
	return rows[0]?.has_paid === true;
};
