import { type Customer, customers } from "@autumn/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { markCustomerUpdatedAt } from "@/internal/customers/customerLsns/markCustomerUpdatedAt.js";

/** Gives an id-less customer with this email the new customer's id; returns its internal id, or null when there is none to claim. */
export const claimCustomerByEmail = async ({
	ctx,
	customer,
}: {
	ctx: AutumnContext;
	customer: Customer;
}): Promise<string | null> => {
	const { id, email, org_id: orgId, env } = customer;
	if (!id || !email) return null;
	const [claimed] = await ctx.db
		.update(customers)
		.set({ id })
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				isNull(customers.id),
				sql`lower(${customers.email}) = lower(${email})`,
			),
		)
		.returning({ internalId: customers.internal_id });
	if (!claimed) return null;
	await markCustomerUpdatedAt({
		db: ctx.db,
		orgId,
		env,
		customerId: id,
		internalCustomerId: claimed.internalId,
	});
	return claimed.internalId;
};
