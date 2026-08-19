import {
	type AppEnv,
	customerProducts,
	VERSIONABLE_CUSTOMER_STATUSES,
} from "@autumn/shared";
import { and, countDistinct, inArray, isNull, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	getBoundedVersionableRowRefIds,
	type VersioningRowRefTargets,
} from "./getBoundedVersionableRowRefs.js";

export type CustomerProductVersioningFlags = {
	hasAnyCustomerProducts: boolean;
	hasVersionableCustomerProducts: boolean;
	/** Versionable CPs that are not seat assignments (`customer_license_link_id` null). */
	hasVersionableDirectCustomerProducts: boolean;
	/** This version's ent/price ids are referenced by a versionable cus_ent/cus_price. */
	hasVersionableRowRefs: boolean;
};

export type CustomerProductVersioningUsage = CustomerProductVersioningFlags & {
	versionableCustomerCount: number;
};

export const emptyVersioningFlags = (): CustomerProductVersioningFlags => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	hasVersionableDirectCustomerProducts: false,
	hasVersionableRowRefs: false,
});

export const emptyVersioningUsage = (): CustomerProductVersioningUsage => ({
	...emptyVersioningFlags(),
	versionableCustomerCount: 0,
});

const emptyUsage = emptyVersioningUsage;

const sqlIn = ({ values }: { values: string[] }) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	);

const collectInternalProductIds = ({
	rows,
}: {
	rows: Array<{ internal_product_id: string | null }>;
}): string[] =>
	rows.flatMap((row) =>
		row.internal_product_id ? [row.internal_product_id] : [],
	);

type TimeVersioningPhaseArgs<T> = {
	phase: string;
	run: () => Promise<T>;
};

type TimeVersioningPhase = <T>(args: TimeVersioningPhaseArgs<T>) => Promise<T>;

const runUntimed = async <T>({ run }: TimeVersioningPhaseArgs<T>): Promise<T> =>
	run();

export const buildVersionableEntitlementRefsQuery = ({
	internalProductIds,
	orgId,
	env,
}: {
	internalProductIds: string[];
	orgId: string;
	env: AppEnv;
}) => {
	const productIds = sqlIn({ values: internalProductIds });
	const statuses = sqlIn({ values: [...VERSIONABLE_CUSTOMER_STATUSES] });

	return sql`
		SELECT DISTINCT t.internal_product_id
		FROM entitlements t
		INNER JOIN customer_entitlements ce
			ON ce.entitlement_id = t.id
		INNER JOIN customer_products cp
			ON ce.customer_product_id COLLATE "C" = cp.id
		INNER JOIN products p
			ON p.internal_id = cp.internal_product_id
		WHERE t.internal_product_id IN (${productIds})
			AND cp.status IN (${statuses})
			AND p.org_id = ${orgId}
			AND p.env = ${env}
	`;
};

export const buildVersionablePriceRefsQuery = ({
	internalProductIds,
	orgId,
	env,
}: {
	internalProductIds: string[];
	orgId: string;
	env: AppEnv;
}) => {
	const productIds = sqlIn({ values: internalProductIds });
	const statuses = sqlIn({ values: [...VERSIONABLE_CUSTOMER_STATUSES] });

	return sql`
		SELECT DISTINCT t.internal_product_id
		FROM prices t
		INNER JOIN customer_prices cpr
			ON cpr.price_id = t.id
		INNER JOIN customer_products cp
			ON cpr.customer_product_id COLLATE "C" = cp.id
		INNER JOIN products p
			ON p.internal_id = cp.internal_product_id
		WHERE t.internal_product_id IN (${productIds})
			AND cp.status IN (${statuses})
			AND p.org_id = ${orgId}
			AND p.env = ${env}
	`;
};

const internalProductIdsWithVersionableRowRefs = async ({
	db,
	internalProductIds,
	orgId,
	env,
	timePhase,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
	orgId: string;
	env: AppEnv;
	timePhase?: TimeVersioningPhase;
}): Promise<Set<string>> => {
	const timed = timePhase ?? runUntimed;

	const [entitlementRows, priceRows] = await Promise.all([
		timed({
			phase: "versioning_usage.entitlement_refs",
			run: () =>
				db.execute<{ internal_product_id: string | null }>(
					buildVersionableEntitlementRefsQuery({
						internalProductIds,
						orgId,
						env,
					}),
				),
		}),
		timed({
			phase: "versioning_usage.price_refs",
			run: () =>
				db.execute<{ internal_product_id: string | null }>(
					buildVersionablePriceRefsQuery({ internalProductIds, orgId, env }),
				),
		}),
	]);

	return new Set([
		...collectInternalProductIds({ rows: [...entitlementRows] }),
		...collectInternalProductIds({ rows: [...priceRows] }),
	]);
};

export const buildBoundedVersioningCustomerProductsQuery = ({
	internalProductIds,
}: {
	internalProductIds: string[];
}) => {
	const statuses = sqlIn({ values: [...VERSIONABLE_CUSTOMER_STATUSES] });

	return sql`
		SELECT
			candidate.internal_product_id,
			EXISTS (
				SELECT 1
				FROM customer_products cp
				WHERE cp.internal_product_id = candidate.internal_product_id
				LIMIT 1
			) AS has_any_customer_products,
			EXISTS (
				SELECT 1
				FROM customer_products cp
				WHERE cp.internal_product_id = candidate.internal_product_id
					AND cp.status IN (${statuses})
				LIMIT 1
			) AS has_versionable_customer_products,
			EXISTS (
				SELECT 1
				FROM customer_products cp
				WHERE cp.internal_product_id = candidate.internal_product_id
					AND cp.status IN (${statuses})
					AND cp.customer_license_link_id IS NULL
				LIMIT 1
			) AS has_versionable_direct_customer_products
		FROM unnest(${sql.param(internalProductIds)}::text[])
			AS candidate(internal_product_id)
	`;
};

export const getVersioningFlags = async ({
	db,
	internalProductIds,
	rowRefTargets,
	timePhase,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
	rowRefTargets: VersioningRowRefTargets;
	timePhase?: TimeVersioningPhase;
}): Promise<Map<string, CustomerProductVersioningFlags>> => {
	const flags = new Map(
		internalProductIds.map((internalProductId) => [
			internalProductId,
			emptyVersioningFlags(),
		]),
	);
	if (internalProductIds.length === 0) return flags;

	const timed = timePhase ?? runUntimed;
	const [rows, rowRefIds] = await Promise.all([
		timed({
			phase: "versioning_usage.customer_products",
			run: () =>
				db.execute<{
					internal_product_id: string;
					has_any_customer_products: boolean;
					has_versionable_customer_products: boolean;
					has_versionable_direct_customer_products: boolean;
				}>(buildBoundedVersioningCustomerProductsQuery({ internalProductIds })),
		}),
		getBoundedVersionableRowRefIds({
			db,
			targets: rowRefTargets,
			timePhase,
		}),
	]);

	for (const row of rows) {
		flags.set(row.internal_product_id, {
			hasAnyCustomerProducts: row.has_any_customer_products,
			hasVersionableCustomerProducts: row.has_versionable_customer_products,
			hasVersionableDirectCustomerProducts:
				row.has_versionable_direct_customer_products,
			hasVersionableRowRefs: rowRefIds.has(row.internal_product_id),
		});
	}

	return flags;
};

export const buildVersioningCustomerProductsQuery = ({
	db,
	internalProductIds,
	excludeLicenseAssignments,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
	excludeLicenseAssignments?: boolean;
}) =>
	db
		.select({
			internalProductId: customerProducts.internal_product_id,
			anyCount: countDistinct(customerProducts.id).as("any_count"),
			versionableCount: countDistinct(
				sql`CASE WHEN ${inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES)} THEN ${customerProducts.id} END`,
			).as("versionable_count"),
			versionableDirectCount: countDistinct(
				sql`CASE WHEN ${inArray(customerProducts.status, VERSIONABLE_CUSTOMER_STATUSES)} AND ${isNull(customerProducts.customer_license_link_id)} THEN ${customerProducts.id} END`,
			).as("versionable_direct_count"),
		})
		.from(customerProducts)
		.where(
			and(
				inArray(customerProducts.internal_product_id, internalProductIds),
				excludeLicenseAssignments
					? isNull(customerProducts.customer_license_link_id)
					: undefined,
			),
		)
		.groupBy(customerProducts.internal_product_id);

export const getVersioningUsage = async ({
	db,
	internalProductIds,
	orgId,
	env,
	excludeLicenseAssignments,
	timePhase,
}: {
	db: DrizzleCli;
	internalProductIds: string[];
	orgId: string;
	env: AppEnv;
	/** Seat assignments live on the license plan but are migrated through the
	 * parent's upsert_licenses, so a plan-scoped op can never reach them. */
	excludeLicenseAssignments?: boolean;
	timePhase?: TimeVersioningPhase;
}): Promise<Map<string, CustomerProductVersioningUsage>> => {
	const usage = new Map(
		internalProductIds.map((internalProductId) => [
			internalProductId,
			emptyUsage(),
		]),
	);
	if (internalProductIds.length === 0) return usage;

	const timed = timePhase ?? runUntimed;

	const [result, rowRefIds] = await Promise.all([
		timed({
			phase: "versioning_usage.customer_products",
			run: () =>
				buildVersioningCustomerProductsQuery({
					db,
					internalProductIds,
					excludeLicenseAssignments,
				}),
		}),
		internalProductIdsWithVersionableRowRefs({
			db,
			internalProductIds,
			orgId,
			env,
			timePhase,
		}),
	]);

	for (const row of result) {
		usage.set(row.internalProductId, {
			hasAnyCustomerProducts: Number(row.anyCount) > 0,
			hasVersionableCustomerProducts: Number(row.versionableCount) > 0,
			hasVersionableDirectCustomerProducts:
				Number(row.versionableDirectCount) > 0,
			versionableCustomerCount: Number(row.versionableCount),
			hasVersionableRowRefs: rowRefIds.has(row.internalProductId),
		});
	}

	for (const internalProductId of rowRefIds) {
		const current = usage.get(internalProductId) ?? emptyUsage();
		usage.set(internalProductId, {
			...current,
			hasVersionableRowRefs: true,
		});
	}

	return usage;
};

export const getVersioningUsageForProduct = async ({
	db,
	internalProductId,
	orgId,
	env,
	excludeLicenseAssignments,
}: {
	db: DrizzleCli;
	internalProductId: string;
	orgId: string;
	env: AppEnv;
	excludeLicenseAssignments?: boolean;
}): Promise<CustomerProductVersioningUsage> => {
	const usageByProduct = await getVersioningUsage({
		db,
		internalProductIds: [internalProductId],
		orgId,
		env,
		excludeLicenseAssignments,
	});

	return usageByProduct.get(internalProductId) ?? emptyUsage();
};
