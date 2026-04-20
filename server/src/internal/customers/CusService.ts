import {
	AppEnv,
	type CusProductStatus,
	type Customer,
	CustomerExpand,
	CustomerNotFoundError,
	customerProducts,
	customers,
	type Entity,
	type EntityExpand,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	InternalError,
	type ListCustomersV2Params,
	type Organization,
	products,
	RecaseError,
} from "@autumn/shared";
import {
	and,
	count,
	countDistinct,
	eq,
	getTableColumns,
	ilike,
	inArray,
	or,
	sql,
	type Table,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { executeWithHealthTracking } from "@/db/pgHealthMonitor.js";
import type { RepoContext } from "@/db/repoContext.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { withSpan } from "../analytics/tracer/spanUtils.js";
import {
	getOrgCusProductLimit,
	getOrgEntitiesLimit,
} from "../misc/edgeConfig/orgLimitsStore.js";
import { resetCustomerEntitlements } from "./actions/resetCustomerEntitlements/resetCustomerEntitlements.js";
import {
	ACTIVE_STATUSES,
	RELEVANT_STATUSES,
} from "./cusProducts/CusProductService.js";
import { getFullCusQuery, hasCustomerListFilters } from "./getFullCusQuery.js";

// const tracer = trace.getTracer("express");

export class CusService {
	static async getFull({
		ctx,
		idOrInternalId,
		inStatuses = RELEVANT_STATUSES,
		withEntities = false,
		entityId,
		expand,
		withSubs = false,
		allowNotFound = false,
		withEvents = false,
		explain = false,
		skipReset = false,
	}: {
		ctx: AutumnContext;
		idOrInternalId: string;
		inStatuses?: CusProductStatus[];
		withEntities?: boolean;
		entityId?: string;
		expand?: (CustomerExpand | EntityExpand)[];
		withSubs?: boolean;
		allowNotFound?: boolean;
		withEvents?: boolean;
		explain?: boolean;
		skipReset?: boolean;
	}): Promise<FullCustomer> {
		const { db, org, env } = ctx;
		const orgId = org.id;

		const includeInvoices = expand?.includes(CustomerExpand.Invoices) || false;
		const withTrialsUsed = expand?.includes(CustomerExpand.TrialsUsed) || false;

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
				const cusProductLimit = getOrgCusProductLimit({
					orgId,
					orgSlug: org.slug,
				});
				const entitiesLimit = getOrgEntitiesLimit({
					orgId,
					orgSlug: org.slug,
				});

				const query = getFullCusQuery({
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
					cusProductLimit,
					entitiesLimit,
				});

				if (explain) {
					const explainQuery = sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`;
					const result = await db.execute(explainQuery);
					return result as unknown as FullCustomer;
				}

				const { result, usedReplica } = await executeWithHealthTracking({
					db,
					query,
					useReplica: ctx.testOptions?.useReplica,
				});

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

				const fullCus = data as FullCustomer;

				if (orgId === "org_2x5sJDcxhpVDjyUSqs4khaaNnxq") {
					fullCus.customer_products = (
						fullCus.customer_products as FullCusProduct[]
					)
						.sort((a, b) => b.customer_prices.length - a.customer_prices.length)
						.slice(0, 5);
				}

				if (
					orgId === "GG6tnmO7cHb40PNhwYBTZtxQdeL74NHF" &&
					idOrInternalId === "698fb72e4c5fa12c1cd11ddc"
				) {
					fullCus.customer_products = (
						fullCus.customer_products as FullCusProduct[]
					)
						.sort((a, b) => b.customer_prices.length - a.customer_prices.length)
						.slice(0, 5);

					fullCus.entities = (fullCus.entities as Entity[]).slice(0, 50);
				}
				if (!usedReplica && !skipReset) {
					// Skip reset only when executeWithHealthTracking explicitly chose the
					// replica. Lazy reset writes themselves go through dbGeneral.
					await resetCustomerEntitlements({
						fullCus,
						ctx,
					});
				}

				return fullCus;
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
		ctx,
		stripeId,
	}: {
		ctx: AutumnContext;
		stripeId: string;
	}) {
		const { db, org, env } = ctx;
		const customer = await db.query.customers.findFirst({
			where: and(
				eq(sql`processor->>'id'`, stripeId),
				eq(customers.org_id, org.id),
				eq(customers.env, env),
			),
		});

		if (!customer) return null;

		return customer as Customer;
	}

	static async insert({ db, data }: { db: DrizzleCli; data: Customer }) {
		const results = await db.insert(customers).values(data).returning();

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

	static async countByOrgIdAndEnv({
		ctx,
	}: {
		ctx: AutumnContext;
	}): Promise<{ total_count: number }> {
		const { db } = ctx;
		const [result] = await db
			.select({ total_count: count() })
			.from(customers)
			.where(and(eq(customers.org_id, ctx.org.id), eq(customers.env, ctx.env)));
		return { total_count: result?.total_count ?? 0 };
	}

	static async countFilteredByOrgIdAndEnv({
		ctx,
		query,
	}: {
		ctx: AutumnContext;
		query?: Pick<
			ListCustomersV2Params,
			"plans" | "search" | "subscription_status" | "processors"
		>;
	}): Promise<{ total_filtered_count: number }> {
		if (!hasCustomerListFilters({ ...query })) {
			const { total_count } = await CusService.countByOrgIdAndEnv({ ctx });
			return { total_filtered_count: total_count };
		}

		const search = query?.search?.trim();
		const inStatuses = query?.subscription_status
			? [query.subscription_status as CusProductStatus]
			: ACTIVE_STATUSES;

		const processorFilter = query?.processors?.length
			? or(
					...query.processors
						.map((proc) => {
							if (proc === "stripe")
								return sql`(${customers.processor}->>'id' IS NOT NULL)`;
							if (proc === "revenuecat")
								return sql`EXISTS (
									SELECT 1
									FROM customer_products cp_processor
									WHERE cp_processor.internal_customer_id = ${customers.internal_id}
										AND cp_processor.processor->>'type' = 'revenuecat'
								)`;
							if (proc === "vercel")
								return sql`(${customers.processors}->>'vercel' IS NOT NULL)`;
							return undefined;
						})
						.filter((c): c is NonNullable<typeof c> => c !== undefined),
				)
			: undefined;

		if (!query?.plans?.length) {
			const [result] = await ctx.db
				.select({ total_filtered_count: count() })
				.from(customers)
				.where(
					and(
						eq(customers.org_id, ctx.org.id),
						eq(customers.env, ctx.env),
						search
							? or(
									ilike(customers.id, `%${search}%`),
									ilike(customers.name, `%${search}%`),
									ilike(customers.email, `%${search}%`),
								)
							: undefined,
						processorFilter,
					),
				);

			return {
				total_filtered_count: result?.total_filtered_count ?? 0,
			};
		}

		const productConditions = query.plans.map((plan) => {
			if (plan.versions?.length) {
				return and(
					eq(products.id, plan.id),
					inArray(products.version, plan.versions),
				);
			}

			return eq(products.id, plan.id);
		});

		const matchingProducts = await ctx.db
			.select({ internal_id: products.internal_id })
			.from(products)
			.where(
				and(
					eq(products.org_id, ctx.org.id),
					eq(products.env, ctx.env),
					or(...productConditions),
				),
			);

		const internalProductIds = matchingProducts.map(
			(product) => product.internal_id,
		);

		if (internalProductIds.length === 0) {
			return { total_filtered_count: 0 };
		}

		const [result] = await ctx.db
			.select({
				total_filtered_count: countDistinct(
					sql`CASE WHEN ${inArray(customerProducts.status, inStatuses)} THEN ${customerProducts.internal_customer_id} END`,
				),
			})
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					inArray(customerProducts.internal_product_id, internalProductIds),
					or(
						search
							? and(
									eq(customers.org_id, ctx.org.id),
									eq(customers.env, ctx.env),
									or(
										ilike(customers.id, `%${search}%`),
										ilike(customers.name, `%${search}%`),
										ilike(customers.email, `%${search}%`),
									),
								)
							: undefined,
					),
					processorFilter,
				),
			);

		return {
			total_filtered_count: result?.total_filtered_count ?? 0,
		};
	}

	/**
	 * Insert a new customer, or claim an existing null-ID customer by email.
	 *
	 * Behavior:
	 * - If customer with same ID exists: return existing (no update)
	 * - If customer with same email exists with id=NULL and new request has ID: claim it (set ID only)
	 * - If customer with same email exists with id=NULL and new request has id=NULL: return existing
	 * - Otherwise: insert new customer
	 *
	 * IMPORTANT: Only updates the `id` field when claiming. Does NOT update any other fields.
	 * This prevents race conditions where concurrent requests could overwrite data.
	 *
	 * Returns { customer, wasUpdate } where wasUpdate=true if customer already existed.
	 */
	static async insertOrClaimEmail({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: Customer;
	}): Promise<{ customer: Customer; wasUpdate: boolean }> {
		const columns = getTableColumns(customers);
		const columnEntries = Object.entries(columns);
		const columnNames = columnEntries.map(([_, col]) => col.name);

		// Build values array in same order as columnNames
		const values = columnEntries.map(([key, col]) => {
			const value = data[key as keyof Customer];
			if (col.dataType === "json") {
				const jsonValue =
					value !== undefined && value !== null
						? JSON.stringify(value)
						: col.default !== undefined
							? "{}"
							: "null";
				return sql`${jsonValue}::jsonb`;
			}
			return sql`${value ?? null}`;
		});

		// Conflict target differs based on incoming id:
		// - id != NULL: Use cus_id_constraint (handles ID collisions)
		// - id = NULL: Use partial index (handles email collisions for null-id rows)
		const conflictClause =
			data.id !== null
				? sql`ON CONFLICT ON CONSTRAINT cus_id_constraint`
				: sql`ON CONFLICT (org_id, env, lower(email)) WHERE id IS NULL AND email IS NOT NULL AND email != ''`;

		// CTE handles all cases:
		// - Claim: If email exists with id=NULL and new request has ID, set the ID (claim the customer)
		// - Insert: If no claim happened, try to insert
		// - On conflict: Do nothing (customer already exists), xmax will indicate it was an update
		const results = await db.execute<
			Customer & { xmax: string; was_claim: boolean }
		>(sql`
			WITH claim AS (
				UPDATE customers
				SET id = ${data.id}
				WHERE org_id = ${data.org_id}
					AND env = ${data.env}
					AND id IS NULL
					AND ${data.id}::text IS NOT NULL
					AND email IS NOT NULL
					AND lower(email) = lower(${data.email ?? ""})
				RETURNING *, xmax::text, true as was_claim
			),
			insert_new AS (
				INSERT INTO customers (${sql.raw(columnNames.join(", "))})
				SELECT ${sql.join(values, sql`, `)}
				WHERE NOT EXISTS (SELECT 1 FROM claim)
				${conflictClause}
				DO UPDATE SET id = customers.id
				RETURNING *, xmax::text, false as was_claim
			)
			SELECT * FROM claim
			UNION ALL
			SELECT * FROM insert_new
		`);

		if (results && results.length > 0) {
			const { xmax, was_claim, ...customer } = results[0];
			// wasUpdate if: claimed existing row OR xmax indicates update (conflict happened)
			const wasUpdate = was_claim || xmax !== "0";
			return { customer: customer as Customer, wasUpdate };
		}

		throw new InternalError({
			message:
				"[CusService.upsert] Failed to insert customer, no results returned",
		});
	}

	static async update({
		ctx,
		idOrInternalId,
		update,
	}: {
		ctx: RepoContext;
		idOrInternalId: string;
		update: Partial<Customer>;
	}) {
		const { db, org, env } = ctx;
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
						eq(customers.org_id, org.id),
						eq(customers.env, env),
					),
				)
				.returning();

			if (results && results.length > 0) {
				const customer = results[0] as Customer;

				return customer;
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

	/** Deletes customers in batches to avoid locking all rows at once. */
	static async safeDeleteByOrgId({
		db,
		orgId,
		env,
		batchSize = 250,
	}: {
		db: DrizzleCli;
		orgId: string;
		env: AppEnv;
		batchSize?: number;
	}) {
		if (env === AppEnv.Live)
			throw new Error("Cannot delete all customers under org in live mode");

		while (true) {
			const batch = await db
				.select({ internal_id: customers.internal_id })
				.from(customers)
				.where(and(eq(customers.org_id, orgId), eq(customers.env, env)))
				.limit(batchSize);

			if (batch.length === 0) break;

			const ids = batch.map((r) => r.internal_id);

			await db
				.delete(customers)
				.where(
					and(
						inArray(customers.internal_id, ids),
						eq(customers.org_id, orgId),
						eq(customers.env, env),
					),
				);
		}
	}

	static async getByVercelId({
		ctx,
		vercelInstallationId,
		expand,
	}: {
		ctx: AutumnContext;
		vercelInstallationId: string;
		expand?: (CustomerExpand | EntityExpand)[];
	}) {
		const { db, org, env } = ctx;

		// This assumes the "processors" column is a JSONB object that can have a "vercel" object with "installation_id"
		const results = await db
			.select()
			.from(customers as unknown as Table)
			.where(
				and(
					eq(customers.org_id, org.id),
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
				ctx,
				idOrInternalId: customer.internal_id,
				expand,
			})) as FullCustomer;
		}
	}
}
