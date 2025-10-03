import {
	type AppEnv,
	CusExpand,
	type CusProductStatus,
	type Customer,
	customers,
	type EntityExpand,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type Organization,
} from "@autumn/shared";
import { trace } from "@opentelemetry/api";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import RecaseError from "@/utils/errorUtils.js";
import { withSpan } from "../analytics/tracer/spanUtils.js";
import { RELEVANT_STATUSES } from "./cusProducts/CusProductService.js";
import { getFullCusQuery } from "./getFullCusQuery.js";

const tracer = trace.getTracer("express");

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
					entityId,
				);

				const result = await db.execute(query);

				if (!result || result.length == 0) {
					if (allowNotFound) {
						// @ts-expect-error
						return null as FullCustomer;
					}

					throw new RecaseError({
						message: `Customer ${idOrInternalId} not found`,
						code: ErrCode.CustomerNotFound,
						statusCode: StatusCodes.NOT_FOUND,
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
	}: {
		db: DrizzleCli;
		stripeId: string;
	}) {
		const customer = await db.query.customers.findFirst({
			where: eq(sql`processor->>'id'`, stripeId),
		});

		if (!customer) {
			return null;
		}

		return customer as Customer;
	}

	static async insert({ db, data }: { db: DrizzleCli; data: Customer }) {
		try {
			const results = await db
				.insert(customers)
				.values(data as any)
				.returning();
			if (results && results.length > 0) {
				return results[0] as Customer;
			} else {
				return null;
			}
		} catch (error: any) {
			if (error.code === "23505") {
				throw new RecaseError({
					code: ErrCode.DuplicateCustomerId,
					message: "Customer ID already exists",
					statusCode: StatusCodes.BAD_REQUEST,
					data: error,
				});
			}
			throw error;
		}
	}

	static async update({
		db,
		internalCusId,
		update,
	}: {
		db: DrizzleCli;
		internalCusId: string;
		update: any;
	}) {
		try {
			const results = await db
				.update(customers)
				.set(update)
				.where(eq(customers.internal_id, internalCusId))
				.returning();

			if (results && results.length > 0) {
				return results[0] as Customer;
			} else {
				return null;
			}
		} catch (error) {
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
		const results = await db
			.delete(customers)
			.where(and(eq(customers.org_id, orgId), eq(customers.env, env)))
			.returning();

		return results;
	}
}
