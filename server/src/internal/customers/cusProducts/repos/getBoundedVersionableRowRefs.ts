import { VERSIONABLE_CUSTOMER_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export type VersioningRowRefTarget = {
	id: string;
	internal_product_id: string;
};

export type VersioningRowRefTargets = {
	entitlements: VersioningRowRefTarget[];
	prices: VersioningRowRefTarget[];
};

type VersioningRowRefSource = {
	refTable: "customer_entitlements" | "customer_prices";
	targetColumn: "entitlement_id" | "price_id";
};

type TimeVersioningPhaseArgs<T> = {
	phase: string;
	run: () => Promise<T>;
};

type TimeVersioningPhase = <T>(args: TimeVersioningPhaseArgs<T>) => Promise<T>;

const BOUNDED_ROW_REF_PROBE_CHUNK_SIZE = 50;

const sqlIn = ({ values }: { values: string[] }) =>
	sql.join(
		values.map((value) => sql`${value}`),
		sql`, `,
	);

const runUntimed = async <T>({ run }: TimeVersioningPhaseArgs<T>): Promise<T> =>
	run();

export const buildBoundedVersionableRowRefsQuery = ({
	targets,
	refTable,
	targetColumn,
}: {
	targets: VersioningRowRefTarget[];
	refTable: VersioningRowRefSource["refTable"];
	targetColumn: VersioningRowRefSource["targetColumn"];
}) => {
	if (targets.length === 0) {
		return sql`SELECT NULL::text AS internal_product_id WHERE false`;
	}

	const statuses = sqlIn({ values: [...VERSIONABLE_CUSTOMER_STATUSES] });
	const targetsByProduct = new Map<string, VersioningRowRefTarget[]>();
	for (const target of targets) {
		const productTargets =
			targetsByProduct.get(target.internal_product_id) ?? [];
		productTargets.push(target);
		targetsByProduct.set(target.internal_product_id, productTargets);
	}

	const productProbes = [...targetsByProduct.entries()].map(
		([internalProductId, productTargets]) => {
			const rowProbes = productTargets.map(
				(target) => sql`
					(
						SELECT 1 AS found
						FROM (
							SELECT ref.customer_product_id
							FROM ${sql.raw(refTable)} ref
							WHERE ref.${sql.raw(targetColumn)} = ${target.id}
							OFFSET 0
						) ref
						INNER JOIN LATERAL (
							SELECT 1
							FROM (
								SELECT cp.status
								FROM customer_products cp
								WHERE cp.id = ref.customer_product_id
								LIMIT 1
							) cp
							WHERE cp.status IN (${statuses})
							LIMIT 1
						) cp ON true
						LIMIT 1
					)
				`,
			);

			return sql`
				(
					SELECT ${internalProductId}::text AS internal_product_id
					FROM (${sql.join(rowProbes, sql` UNION ALL `)}) refs
					LIMIT 1
				)
			`;
		},
	);

	return sql.join(productProbes, sql` UNION ALL `);
};

const getBoundedVersionableRowRefs = async ({
	db,
	targets,
	source,
}: {
	db: DrizzleCli;
	targets: VersioningRowRefTarget[];
	source: VersioningRowRefSource;
}): Promise<Array<{ internal_product_id: string | null }>> => {
	const refs: Array<{ internal_product_id: string | null }> = [];

	for (
		let offset = 0;
		offset < targets.length;
		offset += BOUNDED_ROW_REF_PROBE_CHUNK_SIZE
	) {
		const chunk = targets.slice(
			offset,
			offset + BOUNDED_ROW_REF_PROBE_CHUNK_SIZE,
		);
		const rows = await db.execute<{ internal_product_id: string | null }>(
			buildBoundedVersionableRowRefsQuery({
				targets: chunk,
				refTable: source.refTable,
				targetColumn: source.targetColumn,
			}),
		);
		refs.push(...rows);
	}

	return refs;
};

export const getBoundedVersionableRowRefIds = async ({
	db,
	targets,
	timePhase,
}: {
	db: DrizzleCli;
	targets: VersioningRowRefTargets;
	timePhase?: TimeVersioningPhase;
}): Promise<Set<string>> => {
	const timed = timePhase ?? runUntimed;
	const [entitlementRows, priceRows] = await Promise.all([
		timed({
			phase: "versioning_usage.entitlement_refs",
			run: () =>
				getBoundedVersionableRowRefs({
					db,
					targets: targets.entitlements,
					source: {
						refTable: "customer_entitlements",
						targetColumn: "entitlement_id",
					},
				}),
		}),
		timed({
			phase: "versioning_usage.price_refs",
			run: () =>
				getBoundedVersionableRowRefs({
					db,
					targets: targets.prices,
					source: {
						refTable: "customer_prices",
						targetColumn: "price_id",
					},
				}),
		}),
	]);
	const referencedProductIds = new Set<string>();

	for (const row of [...entitlementRows, ...priceRows]) {
		if (row.internal_product_id) {
			referencedProductIds.add(row.internal_product_id);
		}
	}

	return referencedProductIds;
};
