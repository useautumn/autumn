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
	InternalError,
	type Organization,
	RecaseError,
} from "@autumn/shared";
import {
	and,
	eq,
	getTableColumns,
	ilike,
	or,
	sql,
	type Table,
} from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
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

	/**
	 * Upsert a customer using the email + null ID constraint.
	 *
	 * If a customer with the same (org_id, env, email) exists with id = NULL,
	 * update that row with the new customer data (including the new ID).
	 * Otherwise, insert a new row.
	 *
	 * Returns { customer, wasUpdate } to indicate if an existing row was updated.
	 */
	static async upsert({
		db,
		data,
	}: {
		db: DrizzleCli;
		data: Customer;
	}): Promise<{ customer: Customer; wasUpdate: boolean }> {
		const columns = getTableColumns(customers);
		const columnNames = Object.values(columns).map((col) => col.name);

		// Build values array, handling jsonb columns specially
		const values = Object.entries(columns).map(([key, col]) => {
			const value = data[key as keyof Customer];
			// jsonb columns need JSON.stringify
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

		// Build UPDATE SET clauses
		const excludeFromUpdate = ["internal_id", "org_id", "env", "created_at"];

		// For ON CONFLICT - uses EXCLUDED.column_name
		const updateColsExcluded = Object.values(columns)
			.filter((col) => !excludeFromUpdate.includes(col.name))
			.map((col) => sql.raw(`${col.name} = EXCLUDED.${col.name}`));

		// For CTE claim UPDATE - uses direct values
		const updateColsValues = Object.entries(columns)
			.filter(([_, col]) => !excludeFromUpdate.includes(col.name))
			.map(([key, col]) => {
				const value = data[key as keyof Customer];
				if (col.dataType === "json") {
					const jsonValue =
						value !== undefined && value !== null
							? JSON.stringify(value)
							: col.default !== undefined
								? "{}"
								: "null";
					return sql`${sql.raw(col.name)} = ${jsonValue}::jsonb`;
				}
				return sql`${sql.raw(col.name)} = ${value ?? null}`;
			});

		// Conflict target differs based on incoming id:
		// - id != NULL: Use cus_id_constraint (handles ID collisions)
		// - id = NULL: Use partial index (handles email collisions for null-id rows)
		const conflictClause =
			data.id !== null
				? sql`ON CONFLICT ON CONSTRAINT cus_id_constraint`
				: sql`ON CONFLICT (org_id, env, lower(email)) WHERE id IS NULL AND email IS NOT NULL AND email != ''`;

		// CTE handles all cases:
		// - Case A (id=NULL → id=NULL same email): claim updates existing
		// - Case B (id=x → id=x): insert_new conflicts on cus_id_constraint, upserts
		// - Case C (id=NULL → id=y same email): claim updates existing, sets new id
		const results = await db.execute<
			Customer & { xmax: string; was_claim: boolean }
		>(sql`
			WITH claim AS (
				UPDATE customers
				SET ${sql.join(updateColsValues, sql`, `)}
				WHERE org_id = ${data.org_id}
					AND env = ${data.env}
					AND id IS NULL
					AND email IS NOT NULL
					AND lower(email) = lower(${data.email ?? ""})
				RETURNING *, xmax::text, true as was_claim
			),
			insert_new AS (
				INSERT INTO customers (${sql.raw(columnNames.join(", "))})
				SELECT ${sql.join(values, sql`, `)}
				WHERE NOT EXISTS (SELECT 1 FROM claim)
				${conflictClause}
				DO UPDATE SET ${sql.join(updateColsExcluded, sql`, `)}
				RETURNING *, xmax::text, false as was_claim
			)
			SELECT * FROM claim
			UNION ALL
			SELECT * FROM insert_new
		`);

		if (results && results.length > 0) {
			const { xmax, was_claim, ...customer } = results[0];
			// wasUpdate if: claimed existing row OR xmax indicates update
			const wasUpdate = was_claim || xmax !== "0";
			return { customer: customer as Customer, wasUpdate };
		}

		throw new InternalError({
			message:
				"[CusService.upsert] Failed to insert customer, no results returned",
		});
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
