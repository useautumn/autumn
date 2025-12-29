import {
	AppEnv,
	CusExpand,
	type CusProductStatus,
	type Customer,
	CustomerNotFoundError,
	customers,
	type EntityExpand,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import { and, eq, ilike, or, sql, type Table } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

import { withSpan } from "../analytics/tracer/spanUtils.js";
import { RELEVANT_STATUSES } from "./cusProducts/CusProductService.js";
import { getFullCusQuery } from "./getFullCusQuery.js";

// const tracer = trace.getTracer("express");

export class CusService {
	static async getFull({
		db,
		idOrInternalId,
		orgId,
		env,
		inStatuses = RELEVANT_STATUSES,
		withEntities = false,
		entityId,
		expand,
		withSubs = false,
		allowNotFound = false,
		withEvents = false,
		withExtraCustomerEntitlements = false,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: AppEnv;
		inStatuses?: CusProductStatus[];
		withEntities?: boolean;
		entityId?: string;
		expand?: (CusExpand | EntityExpand)[];
		withSubs?: boolean;
		allowNotFound?: boolean;
		withEvents?: boolean;
		withExtraCustomerEntitlements?: boolean;
	}): Promise<FullCustomer> {
		const includeInvoices = expand?.includes(CusExpand.Invoices) || false;
		const withTrialsUsed = expand?.includes(CusExpand.TrialsUsed) || false;

		return withSpan<FullCustomer>({
			name: "CusService.getFull",
			attributes: {
				idOrInternalId,
				entityId,
				orgId,
				env,
				inStatuses,
				withEntities,
				withSubs,
			},
			fn: async () => {
				const query = getFullCusQuery(
					idOrInternalId,
					orgId,
					env,
					inStatuses,
					includeInvoices,
					withEntities,
					withTrialsUsed,
					withSubs,
					withEvents,
					withExtraCustomerEntitlements,
					entityId,
				);

				const result = await db.execute(query);

				if (!result || result.length === 0) {
					if (allowNotFound) {
						return null as unknown as FullCustomer;
					}

					throw new CustomerNotFoundError({
						customerId: idOrInternalId,
					});
				}

				const data = result[0];
				data.created_at = Number(data.created_at);

				for (const product of data.customer_products as FullCusProduct[]) {
					if (!product.customer_prices) {
						product.customer_prices = [];
					}

					if (!product.customer_entitlements) {
						product.customer_entitlements = [];
					}
				}

				return data as FullCustomer;
			},
		});
	}

	static async get({
		db,
		idOrInternalId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const customer = await db.query.customers.findFirst({
			where: and(
				or(
					eq(customers.id, idOrInternalId),
					eq(customers.internal_id, idOrInternalId),
				),
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			),
		});

		if (!customer) return null;

		return customer as Customer;
	}

	static async getByEmail({
		db,
		email,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		email: string;
		orgId: string;
		env: AppEnv;
	}) {
		const customer = await db.query.customers.findMany({
			where: and(
				ilike(customers.email, email),
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			),
		});

		return customer as Customer[];
	}

	static async getByInternalId({
		db,
		internalId,
		errorIfNotFound = true,
		withOrg = false,
	}: {
		db: DrizzleCli;
		internalId: string;
		errorIfNotFound?: boolean;
		withOrg?: boolean;
	}) {
		const customer = await db.query.customers.findFirst({
			where: eq(customers.internal_id, internalId),
			with: {
				org: withOrg ? true : undefined,
			},
		});

		if (errorIfNotFound && !customer) {
			throw new RecaseError({
				message: `Customer ${internalId} not found`,
				statusCode: 404,
				code: ErrCode.CustomerNotFound,
			});
		} else if (!customer) {
			return null;
		}

		return customer as Customer & { org?: Organization };
	}

	static async getByStripeId({
		db,
		stripeId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		stripeId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const customer = await db.query.customers.findFirst({
			where: and(
				eq(sql`processor->>'id'`, stripeId),
				eq(customers.org_id, orgId),
				eq(customers.env, env),
			),
		});

		if (!customer) return null;

		return customer as Customer;
	}

	static async insert({ db, data }: { db: DrizzleCli; data: Customer }) {
		const results = await db
			.insert(customers)
			.values(data as any)
			.returning();

		// If insert succeeded, return the new customer
		if (results && results.length > 0) {
			return results[0] as Customer;
		}

		// If no results, conflict occurred - fetch and return existing customer
		// This handles race conditions gracefully without error logs
		const existingCustomer = await CusService.get({
			db,
			idOrInternalId: data.id || data.internal_id,
			orgId: data.org_id,
			env: data.env,
		});

		if (existingCustomer) {
			return existingCustomer;
		}

		// Should never reach here, but handle gracefully
		return null;
	}

	static async update({
		db,
		idOrInternalId,
		orgId,
		env,
		update,
	}: {
		db: DrizzleCli;
		idOrInternalId: string;
		orgId: string;
		env: AppEnv;
		update: Partial<Customer>;
	}) {
		try {
			const results = await db
				.update(customers)
				.set(update)
				.where(
					and(
						or(
							eq(customers.id, idOrInternalId),
							eq(customers.internal_id, idOrInternalId),
						),
						eq(customers.org_id, orgId),
						eq(customers.env, env),
					),
				)
				.returning();

			if (results && results.length > 0) {
				return results[0] as Customer;
			} else {
				return null;
			}
		} catch (error) {
			// biome-ignore lint/complexity/noUselessCatch: hello
			throw error;
		}
	}

	static async deleteByInternalId({
		db,
		internalId,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		internalId: string;
		orgId: string;
		env: AppEnv;
	}) {
		const results = await db
			.delete(customers)
			.where(
				and(
					eq(customers.internal_id, internalId),
					eq(customers.org_id, orgId),
					eq(customers.env, env),
				),
			)
			.returning();

		return results;
	}

	static async deleteByOrgId({
		db,
		orgId,
		env,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
	}) {
		if (env === AppEnv.Live)
			throw new Error("Cannot delete all customers under org in live mode");

		const results = await db
			.delete(customers)
			.where(and(eq(customers.org_id, orgId), eq(customers.env, env)))
			.returning();

		return results;
	}

	static async getByVercelId({
		db,
		vercelInstallationId,
		orgId,
		env,
		expand,
	}: {
		db: DrizzleCli;
		vercelInstallationId: string;
		orgId: string;
		env: AppEnv;
		expand?: (CusExpand | EntityExpand)[];
	}) {
		// This assumes the "processors" column is a JSONB object that can have a "vercel" object with "installation_id"
		const results = await db
			.select()
			.from(customers as unknown as Table)
			.where(
				and(
					eq(customers.org_id, orgId),
					eq(customers.env, env),
					// This JSON path works for Postgres jsonb column
					// Check for 'vercel.installation_id' inside the processors JSONB column
					sql`${customers.processors}->'vercel'->>'installation_id' = ${vercelInstallationId}`,
				),
			);

		const customer = results[0] ?? null;

		if (!customer) return null;
		else {
			return (await CusService.getFull({
				db,
				idOrInternalId: customer.internal_id,
				orgId,
				env,
				expand,
			})) as FullCustomer;
		}
	}
}
