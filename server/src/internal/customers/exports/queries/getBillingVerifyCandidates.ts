import { type AppEnv, customerProducts, customers } from "@autumn/shared";
import { and, eq, gt, inArray, min, or, sql } from "drizzle-orm";
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

/** The subset of these Stripe customer ids any Autumn customer points at. */
export const getLinkedStripeCustomerIds = async ({
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
		.selectDistinct({ stripeCustomerId })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				inArray(stripeCustomerId, stripeCustomerIds),
			),
		);

	return new Set(rows.map((row) => row.stripeCustomerId));
};

/** Autumn customer ids keyed by lowercased email. */
export const getCustomerIdsByEmail = async ({
	db,
	orgId,
	env,
	emails,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	emails: string[];
}): Promise<Map<string, string[]>> => {
	if (emails.length === 0) return new Map();

	const lowerEmail = sql<string>`lower(${customers.email})`;
	const rows = await db
		.select({
			email: lowerEmail,
			id: customers.id,
			internalId: customers.internal_id,
		})
		.from(customers)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				inArray(
					lowerEmail,
					emails.map((email) => email.toLowerCase()),
				),
			),
		);

	const customerIdsByEmail = new Map<string, string[]>();
	for (const row of rows) {
		const customerId = row.id ?? row.internalId;
		const existing = customerIdsByEmail.get(row.email);
		if (existing) existing.push(customerId);
		else customerIdsByEmail.set(row.email, [customerId]);
	}
	return customerIdsByEmail;
};
