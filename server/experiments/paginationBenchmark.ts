import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { sql, type SQL } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";
import { getCursorPaginatedFullCusQuery } from "./cursorPaginatedFullCusQuery";

loadLocalEnv();

const ORG_ID = "r7pwHiekGsqt32qGqcVku6thWFh5aHh8";
const ENV: AppEnv = AppEnv.Live;
const LABEL = "runable";
const REPEATS = 5;
const STATEMENT_TIMEOUT_MS = 30_000;
const DEEP_OFFSET_PCT = 45;
const BASE_LIMIT = 1000;
const READ_ONLY = true;
const CUS_PRODUCT_LIMIT = 15;

const RESULTS_DIR = join(import.meta.dir, "results");

type DB = ReturnType<typeof initDrizzle>["db"];

const sharedFullCusOpts = {
	inStatuses: RELEVANT_STATUSES,
	includeInvoices: false,
	withEntities: false,
	withTrialsUsed: false,
	withSubs: true,
	cusProductLimit: CUS_PRODUCT_LIMIT,
};

type Cell = {
	name: string;
	build: () => SQL;
	includeExplain?: boolean;
};

type CellResult = {
	name: string;
	medianMs: number;
	p95Ms: number;
	minMs: number;
	maxMs: number;
	rowCount: number;
	samples: number[];
	explainPlan?: string;
	error?: string;
};

const normalizeRows = (r: unknown): Record<string, unknown>[] => {
	if (Array.isArray(r)) return r as Record<string, unknown>[];
	if (r && typeof r === "object" && "rows" in r) {
		return (r as { rows: Record<string, unknown>[] }).rows;
	}
	return [];
};

const runQueryInTxn = async ({
	db,
	query,
}: {
	db: DB;
	query: SQL;
}): Promise<Record<string, unknown>[]> => {
	return await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`));
		if (READ_ONLY) {
			await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		}
		return normalizeRows(await tx.execute(query));
	});
};

const measureCell = async ({
	db,
	cell,
}: {
	db: DB;
	cell: Cell;
}): Promise<CellResult> => {
	const samples: number[] = [];
	let rowCount = 0;
	let error: string | undefined;

	for (let i = 0; i < REPEATS; i++) {
		const query = cell.build();
		const startedAt = performance.now();
		try {
			const result = await runQueryInTxn({ db, query });
			const elapsed = performance.now() - startedAt;
			samples.push(elapsed);
			rowCount = result.length;
		} catch (err) {
			const elapsed = performance.now() - startedAt;
			samples.push(elapsed);
			error = err instanceof Error ? err.message : String(err);
			break;
		}
	}

	let explainPlan: string | undefined;
	if (cell.includeExplain && !error) {
		try {
			const query = cell.build();
			const explainRows = await runQueryInTxn({
				db,
				query: sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${query}`,
			});
			explainPlan = explainRows.map((row) => row["QUERY PLAN"]).join("\n");
		} catch (err) {
			explainPlan = `EXPLAIN failed: ${err instanceof Error ? err.message : String(err)}`;
		}
	}

	const sorted = [...samples].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
	const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
	const min = sorted[0] ?? 0;
	const max = sorted[sorted.length - 1] ?? 0;

	return {
		name: cell.name,
		medianMs: median,
		p95Ms: p95,
		minMs: min,
		maxMs: max,
		rowCount,
		samples,
		explainPlan,
		error,
	};
};

const revenuecatCountQuery = (): SQL => sql`
	SELECT COUNT(*)::int AS total_count
	FROM customers c
	WHERE c.org_id = ${ORG_ID}
		AND c.env = ${ENV}
		AND EXISTS (
			SELECT 1 FROM customer_products cp
			WHERE cp.internal_customer_id = c.internal_id
				AND cp.processor->>'type' = 'revenuecat'
		)
`;

const resolveRevenuecatCount = async ({ db }: { db: DB }) => {
	const result = await runQueryInTxn({ db, query: revenuecatCountQuery() });
	return (result[0] as { total_count: number }).total_count;
};

const resolveRevenuecatDeepCursor = async ({
	db,
	deepOffset,
}: {
	db: DB;
	deepOffset: number;
}): Promise<{ createdAt: number; id: string }> => {
	const result = await runQueryInTxn({
		db,
		query: sql`
			SELECT c.created_at, c.id
			FROM customers c
			WHERE c.org_id = ${ORG_ID}
				AND c.env = ${ENV}
				AND EXISTS (
					SELECT 1 FROM customer_products cp
					WHERE cp.internal_customer_id = c.internal_id
						AND cp.processor->>'type' = 'revenuecat'
				)
			ORDER BY c.created_at DESC, c.id DESC
			LIMIT 1 OFFSET ${deepOffset}
		`,
	});

	const row = result[0] as { created_at: number; id: string } | undefined;
	if (!row) {
		throw new Error(
			`Could not resolve revenuecat deep cursor at offset ${deepOffset}. Not enough revenuecat customers.`,
		);
	}
	return { createdAt: row.created_at, id: row.id };
};

const buildCells = ({
	deepCursor,
}: {
	deepCursor: { createdAt: number; id: string };
}): Cell[] => {
	return [
		{
			name: `10 cursor / revcat=true / first page / limit ${BASE_LIMIT}`,
			build: () =>
				getCursorPaginatedFullCusQuery({
					orgId: ORG_ID,
					env: ENV,
					limit: BASE_LIMIT,
					processors: ["revenuecat"],
					...sharedFullCusOpts,
				}),
			includeExplain: true,
		},
		{
			name: `11 cursor / revcat=true / deep / limit ${BASE_LIMIT}`,
			build: () =>
				getCursorPaginatedFullCusQuery({
					orgId: ORG_ID,
					env: ENV,
					limit: BASE_LIMIT,
					cursor: deepCursor,
					processors: ["revenuecat"],
					...sharedFullCusOpts,
				}),
			includeExplain: true,
		},
	];
};

const renderResults = ({
	totalCount,
	deepOffset,
	deepCursor,
	results,
}: {
	totalCount: number;
	deepOffset: number;
	deepCursor: { createdAt: number; id: string };
	results: CellResult[];
}): string => {
	const date = new Date().toISOString().slice(0, 10);
	const lines: string[] = [];

	lines.push(`# Pagination Benchmark — ${date} — prod / ${LABEL}`);
	lines.push("");
	lines.push("## Config");
	lines.push("");
	lines.push(`- org_id: \`${ORG_ID}\``);
	lines.push(`- env: \`${ENV}\``);
	lines.push(`- revenuecat_customers: \`${totalCount.toLocaleString()}\``);
	lines.push(
		`- deep_offset (${DEEP_OFFSET_PCT}% within revcat subset): \`${deepOffset.toLocaleString()}\``,
	);
	lines.push(
		`- deep_cursor (revcat-aware): \`{ t: ${deepCursor.createdAt}, id: ${deepCursor.id} }\``,
	);
	lines.push(`- limit: \`${BASE_LIMIT}\``);
	lines.push(`- repeats per cell: ${REPEATS}`);
	lines.push(`- statement_timeout_ms: ${STATEMENT_TIMEOUT_MS}`);
	lines.push(`- read_only: ${READ_ONLY}`);
	lines.push(`- focus: revenuecat filter (single SQL call, cursor + EXISTS combined)`);
	lines.push(`- partial index in place: idx_customer_products_revenuecat_processor`);
	lines.push("");

	lines.push("## Results");
	lines.push("");
	lines.push("| # | Cell | Rows | median ms | p95 ms | min ms | max ms | Error |");
	lines.push("|---|------|------|-----------|--------|--------|--------|-------|");
	for (const r of results) {
		const idx = r.name.split(" ")[0];
		const desc = r.name.split(" ").slice(1).join(" ");
		const errCol = r.error ? `\`${r.error.slice(0, 80)}\`` : "";
		lines.push(
			`| ${idx} | ${desc} | ${r.rowCount} | ${r.medianMs.toFixed(2)} | ${r.p95Ms.toFixed(2)} | ${r.minMs.toFixed(2)} | ${r.maxMs.toFixed(2)} | ${errCol} |`,
		);
	}
	lines.push("");

	lines.push("## EXPLAIN ANALYZE");
	lines.push("");
	for (const r of results) {
		if (!r.explainPlan) continue;
		lines.push(`### ${r.name}`);
		lines.push("");
		lines.push("```");
		lines.push(r.explainPlan);
		lines.push("```");
		lines.push("");
	}

	return lines.join("\n");
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			`\n================ Pagination Benchmark — prod / ${LABEL} ================\n`,
		),
	);

	const { db, client } = initDrizzle();

	try {
		console.log(chalk.cyan(`Org: ${ORG_ID} (${ENV})`));
		console.log(chalk.cyan("Resolving revenuecat customer count..."));
		const totalCount = await resolveRevenuecatCount({ db });
		const deepOffset = Math.floor((totalCount * DEEP_OFFSET_PCT) / 100);
		console.log(
			chalk.gray(
				`  revenuecat_customers = ${totalCount.toLocaleString()}, deep_offset (${DEEP_OFFSET_PCT}% within revcat) = ${deepOffset.toLocaleString()}`,
			),
		);

		console.log(
			chalk.cyan(`Resolving revcat-aware deep cursor at offset ${deepOffset}...`),
		);
		const deepCursor = await resolveRevenuecatDeepCursor({ db, deepOffset });
		console.log(
			chalk.gray(`  cursor = { t: ${deepCursor.createdAt}, id: ${deepCursor.id} }`),
		);
		console.log();

		const cells = buildCells({ deepCursor });
		const results: CellResult[] = [];

		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			process.stdout.write(
				chalk.gray(`[${i + 1}/${cells.length}] ${cell.name} ... `),
			);
			const result = await measureCell({ db, cell });
			results.push(result);
			if (result.error) {
				console.log(chalk.red(`error: ${result.error.slice(0, 80)}`));
			} else {
				console.log(
					chalk.green(
						`median=${result.medianMs.toFixed(2)}ms p95=${result.p95Ms.toFixed(2)}ms rows=${result.rowCount}`,
					),
				);
			}
		}

		const report = renderResults({
			totalCount,
			deepOffset,
			deepCursor,
			results,
		});
		const date = new Date().toISOString().slice(0, 10);
		const outPath = join(RESULTS_DIR, `${date}-prod-${LABEL}.md`);
		writeFileSync(outPath, report);

		console.log();
		console.log(chalk.green(`✅ Report written to ${outPath}`));
		console.log(
			chalk.magentaBright(
				`\n================ Benchmark Complete ================\n`,
			),
		);
	} catch (error) {
		console.error(chalk.red("\n❌ Benchmark failed:"));
		if (error instanceof Error) {
			console.error(chalk.red(`   ${error.message}`));
			console.error(chalk.gray(error.stack));
		} else {
			console.error(chalk.red(`   ${String(error)}`));
		}
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
