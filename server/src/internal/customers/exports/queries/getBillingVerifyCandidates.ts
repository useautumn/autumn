import {
	type AppEnv,
	type CustomerExportSnapshot,
	customerProducts,
	customers,
} from "@autumn/shared";
import {
	and,
	eq,
	exists,
	gt,
	inArray,
	isNotNull,
	min,
	or,
	sql,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type CustomerExportScalarRow,
	customerExportScalarColumns,
	whereCustomerExportPopulation,
} from "./getCustomerExportScalars.js";

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

type CustomerExportPopulationScope = {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	upperBoundInternalId: string;
	createdAtCutoff: number;
};

/** Stripe customers in the population holding a plan tied to a Stripe subscription or schedule. */
export const getStripeLinkedCandidates = async ({
	db,
	...scope
}: CustomerExportPopulationScope): Promise<CustomerExportScalarRow[]> =>
	await db
		.select(customerExportScalarColumns)
		.from(customers)
		.where(
			and(
				whereCustomerExportPopulation(scope),
				isNotNull(sql`${customers.processor}->>'id'`),
				exists(
					db
						.select({ one: sql`1` })
						.from(customerProducts)
						.where(
							and(
								eq(
									customerProducts.internal_customer_id,
									customers.internal_id,
								),
								or(
									gt(sql`cardinality(${customerProducts.subscription_ids})`, 0),
									gt(sql`cardinality(${customerProducts.scheduled_ids})`, 0),
								),
							),
						),
				),
			),
		);

/** Customers in the population pointing at any of these Stripe customer ids. */
export const getCandidatesByStripeCustomerIds = async ({
	db,
	stripeCustomerIds,
	...scope
}: CustomerExportPopulationScope & {
	stripeCustomerIds: string[];
}): Promise<CustomerExportScalarRow[]> => {
	if (stripeCustomerIds.length === 0) return [];

	return await db
		.select(customerExportScalarColumns)
		.from(customers)
		.where(
			and(
				whereCustomerExportPopulation(scope),
				inArray(sql`${customers.processor}->>'id'`, stripeCustomerIds),
			),
		);
};

/** Stripe customer ids that more than one Autumn customer in the org points at. */
export const getSharedStripeCustomerIds = async ({
	db,
	orgId,
	env,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
}): Promise<Set<string>> => {
	const stripeCustomerId = sql<string>`${customers.processor}->>'id'`;
	const rows = await db
		.select({ stripeCustomerId })
		.from(customers)
		.where(
			and(
				eq(customers.org_id, orgId),
				eq(customers.env, env),
				isNotNull(stripeCustomerId),
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
