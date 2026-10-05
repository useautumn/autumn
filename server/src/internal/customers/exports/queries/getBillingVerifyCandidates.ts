import { type AppEnv, customerProducts, customers } from "@autumn/shared";
import { and, eq, gt, inArray, lte, min, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** The oldest customer bounds how far back the Stripe sweep must reach. */
export const getEarliestCustomerCreatedAt = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<number | null> => {
	const rows = await db
		.select({ createdAt: min(customers.created_at) })
		.from(customers)
		.where(and(eq(customers.org_id, orgId), eq(customers.env, env)));

	return rows[0]?.createdAt ?? null;
};

/** Customers holding a plan tied to a Stripe subscription or schedule. */
export const getStripeLinkedCustomerIds = async ({
	db,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
}): Promise<Set<string>> => {
	if (internalCustomerIds.length === 0) return new Set();

	const rows = await db
		.selectDistinct({
			internalCustomerId: customerProducts.internal_customer_id,
		})
		.from(customerProducts)
		.where(
			and(
				inArray(customerProducts.internal_customer_id, internalCustomerIds),
				or(
					gt(sql`cardinality(${customerProducts.subscription_ids})`, 0),
					gt(sql`cardinality(${customerProducts.scheduled_ids})`, 0),
				),
			),
		);

	return new Set(rows.map((row) => row.internalCustomerId));
};

/** Stripe customer ids that more than one Autumn customer points at. */
export const getSharedStripeCustomerIds = async ({
	db,
	orgId,
	env,
	stripeCustomerIds,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	stripeCustomerIds: string[];
}): Promise<Set<string>> => {
	if (stripeCustomerIds.length === 0) return new Set();

	const stripeCustomerId = sql<string>`${customers.processor}->>'id'`;
	const rows = await db
		.select({ stripeCustomerId })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				inArray(stripeCustomerId, stripeCustomerIds),
			),
		)
		.groupBy(stripeCustomerId)
		.having(gt(sql`count(*)`, 1));

	return new Set(rows.map((row) => row.stripeCustomerId));
};

/** Verification only touches customers holding a Stripe-linked plan, which is a
 * few percent of a large org — counting rows instead leaves progress stuck near
 * the end, where those customers are concentrated. */
export const countStripeLinkedCustomers = async ({
	db,
	orgId,
	env,
	upperBoundInternalId,
	createdAtCutoff,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	upperBoundInternalId: string | null;
	createdAtCutoff: number;
}): Promise<number> => {
	if (upperBoundInternalId === null) return 0;

	const rows = await db
		.select({
			total: sql<string>`count(distinct ${customerProducts.internal_customer_id})`,
		})
		.from(customerProducts)
		.innerJoin(
			customers,
			eq(customers.internal_id, customerProducts.internal_customer_id),
		)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				lte(customers.created_at, createdAtCutoff),
				lte(customers.internal_id, upperBoundInternalId),
				or(
					gt(sql`cardinality(${customerProducts.subscription_ids})`, 0),
					gt(sql`cardinality(${customerProducts.scheduled_ids})`, 0),
				),
			),
		);

	return Number(rows[0]?.total ?? 0);
};
