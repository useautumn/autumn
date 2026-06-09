import { AppEnv, type CustomerFilter } from "@autumn/shared";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	buildProcessedPreviewCount,
	buildProcessedPreviewSelect,
	type CustomerExecutionStatus,
	type IncludeProcessed,
} from "@/internal/migrations/v2/filters/customers/buildCustomerSelect.js";
import { initDrizzle } from "../src/db/initDrizzle";
import { FeatureService } from "../src/internal/features/FeatureService.js";

const ORG_ID = process.env.MIGRATION_PREVIEW_ORG_ID;
const MIGRATION_ID = process.env.MIGRATION_PREVIEW_MIGRATION_ID;
const ENV = (process.env.MIGRATION_PREVIEW_ENV ?? AppEnv.Live) as AppEnv;
const PAGE_SIZE = Number(process.env.MIGRATION_PREVIEW_PAGE_SIZE ?? 50);
const EXPLAIN_MAX_LINES = Number(process.env.EXPLAIN_MAX_LINES ?? 80);

if (!ORG_ID) throw new Error("MIGRATION_PREVIEW_ORG_ID is required");
if (!MIGRATION_ID) throw new Error("MIGRATION_PREVIEW_MIGRATION_ID is required");

const dbUrl = process.env.DATABASE_URL ?? "";
console.log(
	"DATABASE URL host:",
	dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)",
);

const dialect = new PgDialect();

const inlineParams = (text: string, params: readonly unknown[]): string =>
	text.replace(/\$(\d+)/g, (_, n) => {
		const value = params[Number(n) - 1];
		if (value === null || value === undefined) return "NULL";
		if (typeof value === "number" || typeof value === "boolean")
			return String(value);
		return `'${String(value).replace(/'/g, "''")}'`;
	});

const truncateExplainText = (text: string, maxLines: number): string => {
	const lines = text.split("\n");
	if (lines.length <= maxLines) return text;
	return [
		...lines.slice(0, maxLines),
		`... (${lines.length - maxLines} more lines truncated)`,
	].join("\n");
};

const printSql = ({ label, query }: { label: string; query: SQL }) => {
	const { sql: text, params } = dialect.sqlToQuery(query);
	console.log(`\n--- SQL: ${label} ---`);
	console.log(inlineParams(text, params));
};

const explain = async ({
	db,
	label,
	query,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	query: SQL;
}) => {
	console.log(`\n=== ${label} ===`);
	printSql({ label, query });
	const startedAt = performance.now();
	const result = await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`);
	const elapsedMs = performance.now() - startedAt;
	const lines = result.map((row) =>
		String((row as Record<string, unknown>)["QUERY PLAN"]),
	);
	console.log(`EXPLAIN wall-clock: ${elapsedMs.toFixed(2)}ms`);
	console.log(truncateExplainText(lines.join("\n"), EXPLAIN_MAX_LINES));
};

const runScalar = async ({
	db,
	label,
	query,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
	label: string;
	query: SQL;
}) => {
	const startedAt = performance.now();
	const result = await db.execute(query);
	console.log(
		`${label}: ${JSON.stringify(result)} (${(performance.now() - startedAt).toFixed(2)}ms)`,
	);
};

const makeIncludeProcessed = ({
	migrationInternalId,
	statuses,
}: {
	migrationInternalId: string;
	statuses?: CustomerExecutionStatus[];
}): IncludeProcessed => ({
	migrationInternalId,
	executionFilter: statuses ? { statuses } : undefined,
});

const buildEnrichQuery = (internalIds: string[]): SQL => sql`
	SELECT c.internal_id, c.id, c.name, c.email, cp.id AS customer_product_id, p.id AS product_id
	FROM customers c
	LEFT JOIN customer_products cp ON c.internal_id = cp.internal_customer_id
	LEFT JOIN products p ON cp.internal_product_id = p.internal_id
	WHERE c.internal_id IN (${sql.join(
		internalIds.map((id) => sql`${id}`),
		sql`, `,
	)})
`;

const main = async () => {
	const usingReplica = Boolean(process.env.DATABASE_REPLICA_URL);
	const { db } = initDrizzle({ replica: usingReplica });
	console.log(
		`=== MIGRATION FILTER PREVIEW (${usingReplica ? "REPLICA" : "PRIMARY"}) ===`,
	);
	console.log(JSON.stringify({ ORG_ID, MIGRATION_ID, ENV, PAGE_SIZE }, null, 2));

	await db.execute(sql`SET statement_timeout = '15000ms'`);
	await db.execute(sql`SET lock_timeout = '100ms'`);
	await db.execute(sql`SET default_transaction_read_only = on`);

	const [migration] = (await db.execute(sql`
		SELECT internal_id, id, filter
		FROM migrations
		WHERE org_id = ${ORG_ID} AND env = ${ENV} AND id = ${MIGRATION_ID}
		LIMIT 1
	`)) as Array<{
		internal_id: string;
		id: string;
		filter: { customer?: CustomerFilter } | null;
	}>;

	if (!migration) {
		throw new Error(
			`Migration ${MIGRATION_ID} not found for org ${ORG_ID} in env ${ENV}`,
		);
	}

	const filter = migration.filter?.customer ?? {};
	console.log(`Resolved migration_internal_id: ${migration.internal_id}`);
	console.log(`Customer filter: ${JSON.stringify(filter, null, 2)}`);

	await runScalar({
		db,
		label: "migration_item_runs by dry_run/status",
		query: sql`
			SELECT dry_run, status, COUNT(*)::bigint AS count
			FROM migration_item_runs
			WHERE migration_internal_id = ${migration.internal_id}
				AND item_kind = 'customer'
			GROUP BY dry_run, status
			ORDER BY dry_run, status
		`,
	});

	const features = await FeatureService.list({ db, orgId: ORG_ID, env: ENV });
	const ctx = { features };
	console.log(`Loaded ${features.length} features for filter resolution.`);

	const baseIncludeProcessed = makeIncludeProcessed({
		migrationInternalId: migration.internal_id,
	});
	const succeededIncludeProcessed = makeIncludeProcessed({
		migrationInternalId: migration.internal_id,
		statuses: ["succeeded"],
	});
	const notRunIncludeProcessed = makeIncludeProcessed({
		migrationInternalId: migration.internal_id,
		statuses: ["not_run"],
	});

	const selectQuery = buildProcessedPreviewSelect({
		orgId: ORG_ID,
		env: ENV,
		filter,
		ctx,
		includeProcessed: baseIncludeProcessed,
		limit: PAGE_SIZE,
	});

	await explain({
		db,
		label: "COUNT no execution status",
		query: buildProcessedPreviewCount({
			orgId: ORG_ID,
			env: ENV,
			filter,
			ctx,
			includeProcessed: baseIncludeProcessed,
		}),
	});
	await explain({ db, label: `SELECT first page limit ${PAGE_SIZE}`, query: selectQuery });

	const selectedRows = (await db.execute(selectQuery)) as Array<{ internal_id: string }>;
	if (selectedRows.length > 0) {
		await explain({
			db,
			label: "ENRICH selected page",
			query: buildEnrichQuery(selectedRows.map((row) => row.internal_id)),
		});
	}

	await explain({
		db,
		label: "COUNT status=succeeded",
		query: buildProcessedPreviewCount({
			orgId: ORG_ID,
			env: ENV,
			filter,
			ctx,
			includeProcessed: succeededIncludeProcessed,
		}),
	});
	await explain({
		db,
		label: "SELECT status=succeeded first page",
		query: buildProcessedPreviewSelect({
			orgId: ORG_ID,
			env: ENV,
			filter,
			ctx,
			includeProcessed: succeededIncludeProcessed,
			limit: PAGE_SIZE,
		}),
	});

	await explain({
		db,
		label: "COUNT status=not_run",
		query: buildProcessedPreviewCount({
			orgId: ORG_ID,
			env: ENV,
			filter,
			ctx,
			includeProcessed: notRunIncludeProcessed,
		}),
	});

	process.exit(0);
};

await main();
