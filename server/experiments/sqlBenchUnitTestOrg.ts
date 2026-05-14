import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { sql, type SQL } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";
import { getOptimizedFullCusQuery } from "./optimizedFullCusQuery";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";
const ENV: AppEnv = AppEnv.Sandbox;
const REPEATS = 5;
const STATEMENT_TIMEOUT_MS = 60_000;
const DEEP_OFFSET_PCT = parseInt(process.env.OFFSET_PCT ?? "60", 10);
const LIMIT = parseInt(process.env.LIMIT ?? "1000", 10);
const CUS_PRODUCT_LIMIT = 15;
const SHOW_EXPLAIN = process.env.EXPLAIN !== "false";
const SKIP_CURRENT = process.env.SKIP_CURRENT === "true";
const SKIP_OPTIMIZED = process.env.SKIP_OPTIMIZED === "true";
const DASHBOARD_MODE = process.env.DASHBOARD === "true";

type DB = ReturnType<typeof initDrizzle>["db"];

const normalizeRows = (r: unknown): Record<string, unknown>[] => {
	if (Array.isArray(r)) return r as Record<string, unknown>[];
	if (r && typeof r === "object" && "rows" in r) {
		return (r as { rows: Record<string, unknown>[] }).rows;
	}
	return [];
};

const runInTxn = async ({ db, query }: { db: DB; query: SQL }) => {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		return normalizeRows(await tx.execute(query));
	});
};

const resolveTotalCount = async ({ db }: { db: DB }) => {
	const result = await runInTxn({
		db,
		query: sql`
			SELECT COUNT(*)::int AS total_count
			FROM customers c
			WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
		`,
	});
	return (result[0] as { total_count: number }).total_count;
};

const resolveDeepCursor = async ({
	db,
	offset,
}: {
	db: DB;
	offset: number;
}) => {
	const result = await runInTxn({
		db,
		query: sql`
			SELECT c.created_at, c.id
			FROM customers c
			WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
			ORDER BY c.created_at DESC, c.id DESC
			LIMIT 1 OFFSET ${offset}
		`,
	});
	const row = result[0] as { created_at: number; id: string } | undefined;
	if (!row) throw new Error(`No customer at offset ${offset}`);
	return { v: 0 as const, t: row.created_at, id: row.id };
};

const buildQuery = (
	cursor?: { v: 0; t: number; id: string },
	variant: "current" | "optimized" = "current",
	internalCustomerIds?: string[],
): SQL => {
	const builder =
		variant === "optimized"
			? getOptimizedFullCusQuery
			: getCursorPaginatedFullCusQuery;
	return builder({
		orgId: ORG_ID,
		env: ENV,
		inStatuses: RELEVANT_STATUSES,
		withSubs: true,
		limit: internalCustomerIds?.length ?? LIMIT,
		cursor,
		internalCustomerIds,
		cusProductLimit: CUS_PRODUCT_LIMIT,
	});
};

const resolveInternalIds = async ({
	db,
	offset,
	limit,
}: {
	db: DB;
	offset: number;
	limit: number;
}): Promise<string[]> => {
	const result = await runInTxn({
		db,
		query: sql`
			SELECT c.internal_id
			FROM customers c
			WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
			ORDER BY c.created_at DESC, c.id DESC
			LIMIT ${limit} OFFSET ${offset}
		`,
	});
	return (result as unknown as { internal_id: string }[]).map(
		(r) => r.internal_id,
	);
};

const measureRun = async ({
	db,
	cursor,
	label,
	variant = "current",
	internalCustomerIds,
}: {
	db: DB;
	cursor?: { v: 0; t: number; id: string };
	label: string;
	variant?: "current" | "optimized";
	internalCustomerIds?: string[];
}) => {
	const samples: number[] = [];
	for (let i = 0; i < REPEATS; i++) {
		const t0 = performance.now();
		await runInTxn({ db, query: buildQuery(cursor, variant, internalCustomerIds) });
		const ms = performance.now() - t0;
		samples.push(ms);
		process.stdout.write(chalk.gray(`  run ${i + 1}/${REPEATS}: ${ms.toFixed(0)}ms\n`));
	}
	const sorted = [...samples].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
	const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
	const min = sorted[0] ?? 0;
	const max = sorted[sorted.length - 1] ?? 0;
	console.log(
		chalk.bold(
			`  ${label}: median=${median.toFixed(0)}ms p95=${p95.toFixed(0)}ms min=${min.toFixed(0)}ms max=${max.toFixed(0)}ms`,
		),
	);
	return { median, p95, min, max, samples };
};

const runExplain = async ({
	db,
	cursor,
	variant = "current",
	internalCustomerIds,
}: {
	db: DB;
	cursor?: { v: 0; t: number; id: string };
	variant?: "current" | "optimized";
	internalCustomerIds?: string[];
}) => {
	const explain = await runInTxn({
		db,
		query: sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${buildQuery(cursor, variant, internalCustomerIds)}`,
	});
	return explain.map((r) => r["QUERY PLAN"]).join("\n");
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			`\n================ SQL Bench — unit-test-org ================\n`,
		),
	);

	const { db, client } = initDrizzle();

	try {
		console.log(chalk.cyan(`Org: ${ORG_ID}  Env: ${ENV}  Limit: ${LIMIT}`));
		console.log(chalk.cyan("Resolving total customer count..."));
		const total = await resolveTotalCount({ db });
		const deepOffset = Math.floor((total * DEEP_OFFSET_PCT) / 100);
		console.log(
			chalk.gray(
				`  total=${total.toLocaleString()}  deep_offset(${DEEP_OFFSET_PCT}%)=${deepOffset.toLocaleString()}`,
			),
		);

		console.log(chalk.cyan(`Resolving deep cursor at offset ${deepOffset}...`));
		const deepCursor = await resolveDeepCursor({ db, offset: deepOffset });
		console.log(
			chalk.gray(`  cursor = { t: ${deepCursor.t}, id: ${deepCursor.id} }\n`),
		);

		let curFirst: { median: number } | null = null;
		let curDeep: { median: number } | null = null;
		let optFirst: { median: number } | null = null;
		let optDeep: { median: number } | null = null;

		let dashIds: string[] | undefined;
		if (DASHBOARD_MODE) {
			const offset = Math.floor((total * DEEP_OFFSET_PCT) / 100);
			console.log(
				chalk.cyan(`Dashboard mode: resolving ${LIMIT} internal_ids at offset ${offset}...`),
			);
			dashIds = await resolveInternalIds({ db, offset, limit: LIMIT });
			console.log(chalk.gray(`  got ${dashIds.length} ids\n`));
		}

		if (!SKIP_CURRENT) {
			console.log(chalk.bold("→ CURRENT  first page:"));
			curFirst = await measureRun({ db, label: "current first" });
			console.log(chalk.bold(`→ CURRENT  deep page${DASHBOARD_MODE ? " (internalCustomerIds)" : ""}:`));
			curDeep = await measureRun({
				db,
				cursor: DASHBOARD_MODE ? undefined : deepCursor,
				internalCustomerIds: DASHBOARD_MODE ? dashIds : undefined,
				label: "current deep",
			});
		} else {
			console.log(chalk.gray("(SKIP_CURRENT=true — skipping current variant)"));
		}

		if (!SKIP_OPTIMIZED) {
			console.log();
			console.log(chalk.bold("→ OPTIMIZED first page:"));
			optFirst = await measureRun({
				db,
				label: "optim first",
				variant: "optimized",
			});
			console.log(chalk.bold(`→ OPTIMIZED deep page${DASHBOARD_MODE ? " (internalCustomerIds)" : ""}:`));
			optDeep = await measureRun({
				db,
				cursor: DASHBOARD_MODE ? undefined : deepCursor,
				internalCustomerIds: DASHBOARD_MODE ? dashIds : undefined,
				label: "optim deep",
				variant: "optimized",
			});
		} else {
			console.log(chalk.gray("(SKIP_OPTIMIZED=true — skipping optimized variant)"));
		}

		if (SHOW_EXPLAIN) {
			if (!SKIP_CURRENT) {
				console.log();
				console.log(
					chalk.magenta("================ EXPLAIN: CURRENT deep ================"),
				);
				console.log(await runExplain({ db, cursor: deepCursor }));
			}
			if (!SKIP_OPTIMIZED) {
				console.log();
				console.log(
					chalk.magenta(
						"================ EXPLAIN: OPTIMIZED deep ================",
					),
				);
				console.log(
					await runExplain({ db, cursor: deepCursor, variant: "optimized" }),
				);
			}
		}

		console.log();
		console.log(chalk.magentaBright("================ Summary ================"));
		const fmtDelta = (oldMs: number, newMs: number) => {
			const delta = ((newMs - oldMs) / oldMs) * 100;
			const arrow = delta < 0 ? "↓" : "↑";
			return chalk[delta < 0 ? "green" : "red"](
				`${arrow}${Math.abs(delta).toFixed(0)}%`,
			);
		};
		if (curFirst && optFirst) {
			console.log(
				`  first page  current=${curFirst.median.toFixed(0)}ms  optimized=${optFirst.median.toFixed(0)}ms  ${fmtDelta(curFirst.median, optFirst.median)}`,
			);
			console.log(
				`  deep page   current=${curDeep!.median.toFixed(0)}ms  optimized=${optDeep!.median.toFixed(0)}ms  ${fmtDelta(curDeep!.median, optDeep!.median)}`,
			);
		} else if (curFirst) {
			console.log(`  first page  current=${curFirst.median.toFixed(0)}ms`);
			console.log(`  deep page   current=${curDeep!.median.toFixed(0)}ms`);
		} else if (optFirst) {
			console.log(`  first page  optimized=${optFirst.median.toFixed(0)}ms`);
			console.log(`  deep page   optimized=${optDeep!.median.toFixed(0)}ms`);
		}
	} catch (err) {
		console.error(chalk.red(`\n❌ ${err instanceof Error ? err.message : err}`));
		if (err instanceof Error && err.stack) console.error(chalk.gray(err.stack));
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
