import {
	type AppEnv,
	type CustomerExportPartition,
	type CustomerExportSnapshot,
	customers,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildSearchPredicates } from "../../CusSearchService.js";
import { buildMatchedCustomersSelect } from "./customerExportMatchSql.js";

export const ROWS_PER_WORKER = 500_000;

// Margin above S3's 5 MiB minimum so rows that vanish mid-export can't shrink
// a non-final part below it.
const TARGET_MIN_PART_BYTES = 8 * 1024 * 1024;

/**
 * Every non-final part must serialize to at least 5 MiB or S3 rejects the
 * completion. The worst-case row is all-empty cells: (fields - 1) commas + CRLF.
 */
export const resolveRowsPerWorker = ({
	fieldCount,
}: {
	fieldCount: number;
}) => {
	const worstCaseRowBytes = Math.max(fieldCount, 1) + 1;
	return Math.max(
		ROWS_PER_WORKER,
		Math.ceil(TARGET_MIN_PART_BYTES / worstCaseRowBytes),
	);
};

export const buildPartitionsFromBoundaries = ({
	boundaryInternalIds,
}: {
	boundaryInternalIds: string[];
}): CustomerExportPartition[] =>
	boundaryInternalIds.map((upperInternalId, index) => ({
		partNumber: index + 1,
		upperInternalId,
		lowerInternalId: boundaryInternalIds[index + 1] ?? null,
	}));

/**
 * Index-only walk of (org_id, env, internal_id DESC) that picks every
 * ROWS_PER_WORKER-th id as a range boundary. The first boundary also bounds the
 * export, so customers created after this walk are excluded.
 */
export const getCustomerExportPartitions = async ({
	db,
	orgId,
	env,
	snapshot,
	rowsPerWorker = ROWS_PER_WORKER,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	snapshot: CustomerExportSnapshot;
	rowsPerWorker?: number;
}): Promise<{ partitions: CustomerExportPartition[]; totalRows: number }> => {
	const predicates = buildSearchPredicates({
		orgId,
		env,
		search: snapshot.search,
		filters: snapshot.filters,
	});

	const matched = buildMatchedCustomersSelect({
		predicates,
		columns: sql`${customers.internal_id} AS internal_id`,
	});

	const rows = (await db.execute(sql`
		WITH matched AS (${matched}),
		ranked AS (
			SELECT internal_id,
			       ROW_NUMBER() OVER (ORDER BY internal_id DESC) AS rn,
			       COUNT(*) OVER () AS total
			FROM matched
		)
		SELECT internal_id, total
		FROM ranked
		WHERE (rn - 1) % ${rowsPerWorker} = 0
		ORDER BY rn
		${planetScaleTag({ query: "getCustomerExportPartitions" })}
	`)) as unknown as Array<{ internal_id: string; total: number | string }>;

	const boundaryInternalIds = rows.map((row) => row.internal_id);
	const totalRows = rows.length === 0 ? 0 : Number(rows[0].total);

	return {
		partitions: buildPartitionsFromBoundaries({ boundaryInternalIds }),
		totalRows,
	};
};
