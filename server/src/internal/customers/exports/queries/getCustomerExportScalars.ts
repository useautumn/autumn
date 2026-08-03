import {
	type AppEnv,
	type CustomerExportSnapshot,
	customers,
} from "@autumn/shared";
import { and, desc, lt, lte, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildSearchPredicates } from "../../CusSearchService.js";

export const CUSTOMER_EXPORT_PAGE_SIZE = 2000;

export type CustomerExportScalarRow = {
	internal_id: string;
	id: string | null;
	name: string | null;
	email: string | null;
};

/** Mirrors the dashboard list predicate exactly, so an export always contains what the table showed. */
const buildExportPredicates = ({
	orgId,
	env,
	snapshot,
}: {
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
}) =>
	buildSearchPredicates({
		orgId,
		env,
		search: snapshot.search,
		filters: snapshot.filters,
	});

export const getCustomerExportUpperBound = async ({
	db,
	orgId,
	env,
	snapshot,
	createdAtCutoff,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	createdAtCutoff: number;
}): Promise<string | null> => {
	const matched = db
		.select({ internal_id: customers.internal_id })
		.from(customers)
		.where(
			and(
				buildExportPredicates({ orgId, env, snapshot }).whereRaw,
				lte(customers.created_at, createdAtCutoff),
			),
		)
		.orderBy(desc(customers.internal_id))
		.limit(1);

	const rows = await db.execute<{ internal_id: string }>(
		sql`${matched} ${planetScaleTag({ query: "getCustomerExportUpperBound" })}`,
	);

	return rows[0]?.internal_id ?? null;
};

export const countCustomerExportRows = async ({
	db,
	orgId,
	env,
	snapshot,
	upperBoundInternalId,
	createdAtCutoff,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	upperBoundInternalId: string | null;
	createdAtCutoff: number;
}): Promise<number> => {
	if (upperBoundInternalId === null) return 0;

	const matched = db
		.select({ total_count: sql<string>`COUNT(*)`.as("total_count") })
		.from(customers)
		.where(
			and(
				buildExportPredicates({ orgId, env, snapshot }).whereRaw,
				lte(customers.created_at, createdAtCutoff),
				lte(customers.internal_id, upperBoundInternalId),
			),
		);

	const rows = await db.execute<{ total_count: number | string }>(
		sql`${matched} ${planetScaleTag({ query: "countCustomerExportRows" })}`,
	);

	return Number(rows[0]?.total_count ?? 0);
};

/** Both snapshot bounds must remain unchanged for the entire keyset walk. */
export const getCustomerExportScalars = async ({
	db,
	orgId,
	env,
	snapshot,
	upperBoundInternalId,
	createdAtCutoff,
	afterInternalId,
	limit = CUSTOMER_EXPORT_PAGE_SIZE,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	upperBoundInternalId: string | null;
	createdAtCutoff: number;
	afterInternalId: string | null;
	limit?: number;
}): Promise<CustomerExportScalarRow[]> => {
	if (upperBoundInternalId === null) return [];

	const matched = db
		.select({
			internal_id: customers.internal_id,
			id: customers.id,
			name: customers.name,
			email: customers.email,
		})
		.from(customers)
		.where(
			and(
				buildExportPredicates({ orgId, env, snapshot }).whereRaw,
				lte(customers.created_at, createdAtCutoff),
				lte(customers.internal_id, upperBoundInternalId),
				afterInternalId
					? lt(customers.internal_id, afterInternalId)
					: undefined,
			),
		)
		.orderBy(desc(customers.internal_id))
		.limit(limit);

	return await db.execute<CustomerExportScalarRow>(
		sql`${matched} ${planetScaleTag({ query: "getCustomerExportScalars" })}`,
	);
};
