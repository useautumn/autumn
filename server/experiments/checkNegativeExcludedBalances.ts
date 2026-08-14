import { AppEnv } from "@autumn/shared";
import { sql } from "drizzle-orm";
// Import initDrizzle directly — avoid `experimentEnv` because its
// `loadLocalEnv()` reads `server/.env` and clobbers env vars injected by
// `infisical run --env=prod` (e.g. DATABASE_URL).
import { initDrizzle } from "../src/db/initDrizzle";

const prodTestOrgId = (() => {
	const v = process.env.PROD_TEST_ORG_ID;
	if (!v) throw new Error("PROD_TEST_ORG_ID env var is required");
	return v;
})();

const dbUrl = process.env.DATABASE_URL ?? "";
console.log(
	"DATABASE URL host:",
	dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)",
);

// Counts cusEnt rows the PG filters exclude but the lake schema cannot
// (expired = true, pooled contributions) that carry a NEGATIVE balance.
// These are the only rows that can DEFLATE a lake-side sum and cause a
// customer to be under-ranked out of the candidate window. ~0 means the
// lake's error is one-sided (inflation only) and verify-and-rerank is safe.

const ORG_ID = prodTestOrgId;
const ENV = AppEnv.Live;
const STATEMENT_TIMEOUT_MS = 60_000;

const main = async () => {
	const usingReplica = Boolean(process.env.DATABASE_REPLICA_URL);
	if (!usingReplica) {
		console.warn("DATABASE_REPLICA_URL not set — using primary.");
	}
	const { db, client } = initDrizzle({ replica: usingReplica });

	const normalizeRows = (r: unknown): Record<string, unknown>[] => {
		if (Array.isArray(r)) return r as Record<string, unknown>[];
		if (r && typeof r === "object" && "rows" in r) {
			return (r as { rows: Record<string, unknown>[] }).rows;
		}
		return [];
	};

	try {
		const result = await db.transaction(async (tx) => {
			await tx.execute(
				sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
			);
			await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
			return await tx.execute(sql`
				SELECT
					f.id AS feature_id,
					COUNT(*) AS total_rows,
					COUNT(*) FILTER (
						WHERE ce.expired IS TRUE OR ce.pooled_contribution_id IS NOT NULL
					) AS excluded_rows,
					COUNT(*) FILTER (
						WHERE ce.balance < 0
							AND (ce.expired IS TRUE OR ce.pooled_contribution_id IS NOT NULL)
					) AS negative_excluded_rows,
					COUNT(DISTINCT ce.internal_customer_id) FILTER (
						WHERE ce.balance < 0
							AND (ce.expired IS TRUE OR ce.pooled_contribution_id IS NOT NULL)
					) AS affected_customers,
					MIN(ce.balance) FILTER (
						WHERE ce.expired IS TRUE OR ce.pooled_contribution_id IS NOT NULL
					) AS worst_excluded_balance
				FROM features f
				JOIN customer_entitlements ce ON ce.internal_feature_id = f.internal_id
				WHERE f.org_id = ${ORG_ID} AND f.env = ${ENV}
				GROUP BY f.id
				ORDER BY negative_excluded_rows DESC, total_rows DESC
			`);
		});

		const rows = normalizeRows(result);
		console.log(
			`\n=== NEGATIVE EXCLUDED BALANCES — org ${ORG_ID} (${ENV}) ===\n`,
		);
		for (const row of rows) {
			const negatives = Number(row.negative_excluded_rows);
			const marker = negatives === 0 ? "✅" : "⚠️";
			console.log(
				`${marker} ${String(row.feature_id).padEnd(20)} rows=${Number(row.total_rows).toLocaleString().padStart(12)}  excluded=${Number(row.excluded_rows).toLocaleString().padStart(10)}  negative_excluded=${negatives.toLocaleString().padStart(8)}  affected_customers=${Number(row.affected_customers).toLocaleString().padStart(8)}  worst=${row.worst_excluded_balance ?? "-"}`,
			);
		}

		const anyNegative = rows.some(
			(row) => Number(row.negative_excluded_rows) > 0,
		);
		console.log(
			anyNegative
				? "\n⚠️  Deflation is possible: some excluded rows are negative. Size the prefilter margin from `worst_excluded_balance`."
				: "\n✅ Lake error is one-sided (inflation only) — verify-and-rerank with over-fetch is safe with no margin.",
		);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
