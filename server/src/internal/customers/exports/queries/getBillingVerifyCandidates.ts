import {
	ACTIVE_STATUSES,
	type AppEnv,
	BillingInterval,
	customerLicenses,
	customerPrices,
	customerProducts,
	customers,
	prices,
} from "@autumn/shared";
import { and, eq, exists, gt, inArray, min, ne, or, sql } from "drizzle-orm";
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

/** Customers holding an active plan with a recurring price or paid seats but no
 * Stripe subscription or schedule — verify reports these as unbilled. Prices
 * are not checked for amount here; verify decides whether the plan is paid. */
export const getUnlinkedPaidPlanCustomerIds = async ({
	db,
	internalCustomerIds,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
}): Promise<Set<string>> => {
	if (internalCustomerIds.length === 0) return new Set();

	const hasRecurringPrice = exists(
		db
			.select({ id: customerPrices.id })
			.from(customerPrices)
			.innerJoin(prices, eq(prices.id, customerPrices.price_id))
			.where(
				and(
					eq(customerPrices.customer_product_id, customerProducts.id),
					ne(sql`${prices.config}->>'interval'`, BillingInterval.OneOff),
				),
			),
	);
	const hasPaidSeats = exists(
		db
			.select({ id: customerLicenses.id })
			.from(customerLicenses)
			.where(
				and(
					eq(customerLicenses.parent_customer_product_id, customerProducts.id),
					gt(customerLicenses.paid_quantity, 0),
				),
			),
	);

	const rows = await db
		.selectDistinct({
			internalCustomerId: customerProducts.internal_customer_id,
		})
		.from(customerProducts)
		.where(
			and(
				inArray(customerProducts.internal_customer_id, internalCustomerIds),
				inArray(customerProducts.status, ACTIVE_STATUSES),
				sql`coalesce(cardinality(${customerProducts.subscription_ids}), 0) = 0`,
				sql`coalesce(cardinality(${customerProducts.scheduled_ids}), 0) = 0`,
				or(hasRecurringPrice, hasPaidSeats),
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
