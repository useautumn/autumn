import { AppEnv, CusProductStatus, type ListCustomersV2Params } from "@autumn/shared";
import chalk from "chalk";
import { sql, type SQL } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { initDrizzle } from "../src/db/initDrizzle";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";
import { getPaginatedFullCusQuery } from "../src/internal/customers/getFullCusQuery";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

// Runs against whatever DATABASE_URL points at. Intentionally bypasses
// the prod-safety guard — laptop → prod is the entire point.

const FIRECRAWL_ORG_ID = "biu9vSF7vghBLSKW1UTDwxHBAivjnPaK";
const RUNABLE_ORG_ID = "r7pwHiekGsqt32qGqcVku6thWFh5aHh8";
const ENV: AppEnv = AppEnv.Live;

const BASE_LIMIT = 1000;
const REPEATS = 5;
const STATEMENT_TIMEOUT_MS = 60_000;
const READ_ONLY = true;
const CUS_PRODUCT_LIMIT = 15;
const DEEP_OFFSET_PCT = 45;
const FIRECRAWL_BASELINE_DEEP_OFFSET = 950_000;

const PLAN_MASSIVE = "free";
const PLAN_MID = "hobby";
const PLAN_RARE = "scale_monthly";
const SEARCH_GMAIL = "@gmail";

const RESULTS_DIR = join(import.meta.dir, "results");

type DB = ReturnType<typeof initDrizzle>["db"];
type Cursor = { v: 0; t: number; id: string };

type FilterOverrides = {
	inStatuses?: CusProductStatus[];
	search?: string;
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	internalCustomerIds?: string[];
};

type Scenario = {
	key: string;
	label: string;
	org: "firecrawl" | "runable";
	orgId: string;
	filter: FilterOverrides;
	withDeep: boolean;
	deepOffset?: number;
	deepCursor?: Cursor;
};

type Cell = {
	scenarioKey: string;
	scenarioLabel: string;
	org: "firecrawl" | "runable";
	queryShape: "offset" | "cursor";
	depth: "page1" | "deep";
	build: () => SQL;
};

type CellResult = Cell & {
	medianMs: number;
	p95Ms: number;
	minMs: number;
	maxMs: number;
	rowCount: number;
	samples: number[];
	error?: string;
};

const sharedFullCusOpts = {
	includeInvoices: false,
	withEntities: false,
	withTrialsUsed: false,
	withSubs: true,
	cusProductLimit: CUS_PRODUCT_LIMIT,
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
}: { db: DB; query: SQL }): Promise<Record<string, unknown>[]> => {
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		if (READ_ONLY) {
			await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		}
		return normalizeRows(await tx.execute(query));
	});
};

const measureCell = async ({
	db,
	cell,
}: { db: DB; cell: Cell }): Promise<CellResult> => {
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

	const sorted = [...samples].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
	const p95 =
		sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
	const min = sorted[0] ?? 0;
	const max = sorted[sorted.length - 1] ?? 0;

	return {
		...cell,
		medianMs: median,
		p95Ms: p95,
		minMs: min,
		maxMs: max,
		rowCount,
		samples,
		error,
	};
};

// Per-filter predicate matching getCustomerListFilterSql, used by the
// resolver helpers (count + deep cursor) so deep cells are filter-aware.
const filterPredicate = (f: FilterOverrides): SQL => {
	const parts: SQL[] = [];

	if (f.internalCustomerIds?.length) {
		parts.push(
			sql`AND c.internal_id IN (${sql.join(
				f.internalCustomerIds.map((id) => sql`${id}`),
				sql`, `,
			)})`,
		);
	}

	if (f.plans?.length) {
		const planConditions = f.plans.map((plan) => {
			if (plan.versions?.length) {
				return sql`(p_filter.id = ${plan.id} AND p_filter.version IN (${sql.join(
					plan.versions.map((v) => sql`${v}`),
					sql`, `,
				)}))`;
			}
			return sql`p_filter.id = ${plan.id}`;
		});
		parts.push(sql`AND EXISTS (
			SELECT 1
			FROM customer_products cp_filter
			JOIN products p_filter ON cp_filter.internal_product_id = p_filter.internal_id
			WHERE cp_filter.internal_customer_id = c.internal_id
				${
					f.inStatuses?.length
						? sql`AND cp_filter.status = ANY(ARRAY[${sql.join(
								f.inStatuses.map((s) => sql`${s}`),
								sql`, `,
							)}])`
						: sql``
				}
				AND (${sql.join(planConditions, sql` OR `)})
		)`);
	}

	const trimmedSearch = f.search?.trim();
	if (trimmedSearch) {
		const pattern = `%${trimmedSearch}%`;
		parts.push(sql`AND (
			c.id ILIKE ${pattern}
			OR c.name ILIKE ${pattern}
			OR c.email ILIKE ${pattern}
		)`);
	}

	if (f.processors?.length) {
		const procConditions = f.processors
			.map((proc) => {
				if (proc === "stripe") return sql`(c.processor->>'id' IS NOT NULL)`;
				if (proc === "revenuecat")
					return sql`EXISTS (
						SELECT 1
						FROM customer_products cp_processor
						WHERE cp_processor.internal_customer_id = c.internal_id
							AND cp_processor.processor->>'type' = 'revenuecat'
					)`;
				if (proc === "vercel") return sql`(c.processors->>'vercel' IS NOT NULL)`;
				return null;
			})
			.filter((c): c is SQL => c !== null);

		if (procConditions.length) {
			parts.push(sql`AND (${sql.join(procConditions, sql` OR `)})`);
		}
	}

	return parts.length ? sql.join(parts, sql` `) : sql``;
};

const resolveCount = async ({
	db,
	orgId,
	filter,
}: { db: DB; orgId: string; filter: FilterOverrides }): Promise<number> => {
	const predicate = filterPredicate(filter);
	const rows = await runQueryInTxn({
		db,
		query: sql`
			SELECT COUNT(*)::int AS total_count
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${ENV}
				${predicate}
		`,
	});
	return (rows[0] as { total_count: number }).total_count;
};

const resolveDeepCursor = async ({
	db,
	orgId,
	filter,
	deepOffset,
}: {
	db: DB;
	orgId: string;
	filter: FilterOverrides;
	deepOffset: number;
}): Promise<Cursor> => {
	const predicate = filterPredicate(filter);
	const rows = await runQueryInTxn({
		db,
		query: sql`
			SELECT c.created_at, c.id
			FROM customers c
			WHERE c.org_id = ${orgId}
				AND c.env = ${ENV}
				${predicate}
			ORDER BY c.created_at DESC, c.id DESC
			LIMIT 1 OFFSET ${deepOffset}
		`,
	});
	const row = rows[0] as { created_at: number; id: string } | undefined;
	if (!row) {
		throw new Error(
			`No row at deep offset ${deepOffset} for filter ${JSON.stringify(filter)}`,
		);
	}
	return { v: 0, t: row.created_at, id: row.id };
};

const resolveFirecrawlInternalIds = async ({
	db,
}: { db: DB }): Promise<string[]> => {
	const rows = await runQueryInTxn({
		db,
		query: sql`
			SELECT internal_id
			FROM customers
			WHERE org_id = ${FIRECRAWL_ORG_ID}
				AND env = ${ENV}
			ORDER BY created_at DESC, id DESC
			LIMIT 10
		`,
	});
	return rows.map((r) => (r as { internal_id: string }).internal_id);
};

const buildScenarios = ({
	firecrawlInternalIds,
}: { firecrawlInternalIds: string[] }): Scenario[] => {
	const fc = (
		key: string,
		label: string,
		filter: FilterOverrides,
		withDeep: boolean,
	): Scenario => ({
		key,
		label,
		org: "firecrawl",
		orgId: FIRECRAWL_ORG_ID,
		filter,
		withDeep,
	});

	return [
		fc("01-baseline", "none (baseline)", {}, true),
		fc("02-search-gmail", `search '${SEARCH_GMAIL}'`, { search: SEARCH_GMAIL }, true),
		fc(
			"03-status-active",
			"inStatuses=['active']",
			{ inStatuses: [CusProductStatus.Active] },
			true,
		),
		fc("04-plan-massive", `plans=['${PLAN_MASSIVE}']`, { plans: [{ id: PLAN_MASSIVE }] }, true),
		fc("05-plan-mid", `plans=['${PLAN_MID}']`, { plans: [{ id: PLAN_MID }] }, true),
		fc("06-plan-rare", `plans=['${PLAN_RARE}']`, { plans: [{ id: PLAN_RARE }] }, false),
		fc("07-processor-stripe", "processors=['stripe']", { processors: ["stripe"] }, true),
		fc(
			"08-internal-ids",
			"internalCustomerIds=[10]",
			{ internalCustomerIds: firecrawlInternalIds },
			false,
		),
		{
			key: "09-processor-revenuecat",
			label: "processors=['revenuecat']",
			org: "runable",
			orgId: RUNABLE_ORG_ID,
			filter: { processors: ["revenuecat"] },
			withDeep: false,
		},
	];
};

const buildCellsForScenario = (s: Scenario): Cell[] => {
	const inStatuses = s.filter.inStatuses ?? RELEVANT_STATUSES;
	const filterArgs = {
		inStatuses,
		search: s.filter.search,
		plans: s.filter.plans,
		processors: s.filter.processors,
		internalCustomerIds: s.filter.internalCustomerIds,
	};

	const cells: Cell[] = [
		{
			scenarioKey: s.key,
			scenarioLabel: s.label,
			org: s.org,
			queryShape: "offset",
			depth: "page1",
			build: () =>
				getPaginatedFullCusQuery({
					orgId: s.orgId,
					env: ENV,
					limit: BASE_LIMIT,
					offset: 0,
					...sharedFullCusOpts,
					...filterArgs,
				}),
		},
		{
			scenarioKey: s.key,
			scenarioLabel: s.label,
			org: s.org,
			queryShape: "cursor",
			depth: "page1",
			build: () =>
				getCursorPaginatedFullCusQuery({
					orgId: s.orgId,
					env: ENV,
					limit: BASE_LIMIT,
					...sharedFullCusOpts,
					...filterArgs,
				}),
		},
	];

	if (s.withDeep && s.deepOffset !== undefined && s.deepCursor) {
		const deepOffset = s.deepOffset;
		const deepCursor = s.deepCursor;
		cells.push(
			{
				scenarioKey: s.key,
				scenarioLabel: s.label,
				org: s.org,
				queryShape: "offset",
				depth: "deep",
				build: () =>
					getPaginatedFullCusQuery({
						orgId: s.orgId,
						env: ENV,
						limit: BASE_LIMIT,
						offset: deepOffset,
						...sharedFullCusOpts,
						...filterArgs,
					}),
			},
			{
				scenarioKey: s.key,
				scenarioLabel: s.label,
				org: s.org,
				queryShape: "cursor",
				depth: "deep",
				build: () =>
					getCursorPaginatedFullCusQuery({
						orgId: s.orgId,
						env: ENV,
						limit: BASE_LIMIT,
						cursor: deepCursor,
						...sharedFullCusOpts,
						...filterArgs,
					}),
			},
		);
	}

	return cells;
};

const pairResults = (
	results: CellResult[],
): {
	scenarioKey: string;
	scenarioLabel: string;
	org: string;
	depth: "page1" | "deep";
	offset?: CellResult;
	cursor?: CellResult;
}[] => {
	const groups = new Map<
		string,
		{
			scenarioKey: string;
			scenarioLabel: string;
			org: string;
			depth: "page1" | "deep";
			offset?: CellResult;
			cursor?: CellResult;
		}
	>();
	for (const r of results) {
		const key = `${r.scenarioKey}|${r.depth}`;
		const group = groups.get(key) ?? {
			scenarioKey: r.scenarioKey,
			scenarioLabel: r.scenarioLabel,
			org: r.org,
			depth: r.depth,
		};
		if (r.queryShape === "offset") group.offset = r;
		else group.cursor = r;
		groups.set(key, group);
	}
	return Array.from(groups.values());
};

const fmt = (n: number | undefined): string =>
	n === undefined ? "—" : n.toFixed(0);

const renderReport = ({
	scenarios,
	pairs,
	totalWallMs,
	dbHost,
}: {
	scenarios: Scenario[];
	pairs: ReturnType<typeof pairResults>;
	totalWallMs: number;
	dbHost: string;
}): string => {
	const date = new Date().toISOString().slice(0, 10);
	const lines: string[] = [];

	lines.push(`# Pagination Benchmark — offset vs cursor — ${date}`);
	lines.push("");
	lines.push("## Config");
	lines.push("");
	lines.push(`- db host: \`${dbHost}\``);
	lines.push(`- env: \`${ENV}\``);
	lines.push(`- limit: ${BASE_LIMIT}`);
	lines.push(`- repeats per cell: ${REPEATS}`);
	lines.push(`- statement_timeout_ms: ${STATEMENT_TIMEOUT_MS}`);
	lines.push(`- read_only: ${READ_ONLY}`);
	lines.push(`- shared opts: withSubs=true, includeInvoices=false, withEntities=false, withTrialsUsed=false, cusProductLimit=${CUS_PRODUCT_LIMIT}`);
	lines.push(`- timings are wall-clock from this laptop around drizzle execute (includes network round-trip + result transfer + deserialize)`);
	lines.push(`- total benchmark wall time: ${(totalWallMs / 1000).toFixed(1)}s`);
	lines.push("");

	lines.push("## Scenarios resolved");
	lines.push("");
	lines.push("| # | Org | Filter | Filtered count | Deep offset | Deep cursor |");
	lines.push("|---|-----|--------|----------------|-------------|-------------|");
	for (const s of scenarios) {
		const count = (s as Scenario & { resolvedCount?: number }).resolvedCount;
		lines.push(
			`| ${s.key} | ${s.org} | \`${s.label}\` | ${count?.toLocaleString() ?? "—"} | ${s.deepOffset?.toLocaleString() ?? "—"} | ${s.deepCursor ? `\`{ t: ${s.deepCursor.t}, id: ${s.deepCursor.id.slice(0, 8)}… }\`` : "—"} |`,
		);
	}
	lines.push("");

	lines.push("## Results");
	lines.push("");
	lines.push(
		"| # | Org | Filter | Depth | offset median ms | cursor median ms | Δ ms | offset p95 | cursor p95 | offset rows | cursor rows | offset error | cursor error |",
	);
	lines.push(
		"|---|-----|--------|-------|------------------|------------------|------|------------|------------|-------------|-------------|--------------|--------------|",
	);
	for (const p of pairs) {
		const off = p.offset;
		const cur = p.cursor;
		const delta =
			off && cur && !off.error && !cur.error
				? cur.medianMs - off.medianMs
				: undefined;
		const deltaStr =
			delta === undefined
				? "—"
				: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`;
		lines.push(
			`| ${p.scenarioKey} | ${p.org} | \`${p.scenarioLabel}\` | ${p.depth} | ${fmt(off?.medianMs)} | ${fmt(cur?.medianMs)} | ${deltaStr} | ${fmt(off?.p95Ms)} | ${fmt(cur?.p95Ms)} | ${off?.rowCount ?? "—"} | ${cur?.rowCount ?? "—"} | ${off?.error ? `\`${off.error.slice(0, 50)}\`` : ""} | ${cur?.error ? `\`${cur.error.slice(0, 50)}\`` : ""} |`,
		);
	}
	lines.push("");

	lines.push("## Raw samples (per cell)");
	lines.push("");
	for (const p of pairs) {
		lines.push(`### ${p.scenarioKey} / ${p.depth}`);
		if (p.offset) {
			lines.push(
				`- offset: [${p.offset.samples.map((s) => s.toFixed(0)).join(", ")}]ms${p.offset.error ? ` (error: ${p.offset.error})` : ""}`,
			);
		}
		if (p.cursor) {
			lines.push(
				`- cursor: [${p.cursor.samples.map((s) => s.toFixed(0)).join(", ")}]ms${p.cursor.error ? ` (error: ${p.cursor.error})` : ""}`,
			);
		}
		lines.push("");
	}

	return lines.join("\n");
};

const redactHost = (url: string | undefined): string => {
	if (!url) return "<unset>";
	try {
		const u = new URL(url);
		return `${u.hostname}:${u.port || "5432"}`;
	} catch {
		return "<unparseable>";
	}
};

const main = async () => {
	const startedAt = performance.now();
	console.log(
		chalk.magentaBright(
			"\n================ Pagination Benchmark — offset vs cursor (prod DB) ================\n",
		),
	);

	const dbHost = redactHost(process.env.DATABASE_URL);
	console.log(chalk.cyan(`db host: ${dbHost}`));

	const { db, client } = initDrizzle();

	try {
		console.log(chalk.cyan("Resolving Firecrawl internal_ids for IN-list cell..."));
		const firecrawlInternalIds = await resolveFirecrawlInternalIds({ db });
		console.log(chalk.gray(`  got ${firecrawlInternalIds.length} ids`));

		const scenarios = buildScenarios({ firecrawlInternalIds });

		// Resolve counts and deep cursors for each scenario before running cells.
		for (const s of scenarios) {
			process.stdout.write(chalk.gray(`Resolving count for ${s.key} (${s.label})... `));
			const count = await resolveCount({ db, orgId: s.orgId, filter: s.filter });
			(s as Scenario & { resolvedCount?: number }).resolvedCount = count;
			console.log(chalk.gray(`${count.toLocaleString()} customers`));

			if (s.withDeep) {
				const deepOffset =
					s.key === "01-baseline"
						? FIRECRAWL_BASELINE_DEEP_OFFSET
						: Math.floor((count * DEEP_OFFSET_PCT) / 100);
				s.deepOffset = deepOffset;
				process.stdout.write(
					chalk.gray(`  resolving deep cursor at offset ${deepOffset}... `),
				);
				try {
					s.deepCursor = await resolveDeepCursor({
						db,
						orgId: s.orgId,
						filter: s.filter,
						deepOffset,
					});
					console.log(
						chalk.gray(
							`{ t: ${s.deepCursor.t}, id: ${s.deepCursor.id.slice(0, 8)}… }`,
						),
					);
				} catch (err) {
					console.log(
						chalk.yellow(
							`failed: ${err instanceof Error ? err.message : String(err)}`,
						),
					);
					s.withDeep = false;
				}
			}
		}

		const cells = scenarios.flatMap(buildCellsForScenario);
		console.log();
		console.log(chalk.cyan(`Running ${cells.length} cells × ${REPEATS} repeats...`));
		console.log();

		const results: CellResult[] = [];
		for (let i = 0; i < cells.length; i++) {
			const cell = cells[i];
			process.stdout.write(
				chalk.gray(
					`[${(i + 1).toString().padStart(2)}/${cells.length}] ${cell.scenarioKey} ${cell.queryShape} ${cell.depth} ... `,
				),
			);
			const result = await measureCell({ db, cell });
			results.push(result);
			if (result.error) {
				console.log(chalk.red(`error: ${result.error.slice(0, 80)}`));
			} else {
				console.log(
					chalk.green(
						`median=${result.medianMs.toFixed(0)}ms p95=${result.p95Ms.toFixed(0)}ms rows=${result.rowCount}`,
					),
				);
			}
		}

		const pairs = pairResults(results);
		const totalWallMs = performance.now() - startedAt;
		const report = renderReport({ scenarios, pairs, totalWallMs, dbHost });

		const date = new Date().toISOString().slice(0, 10);
		const outPath = join(RESULTS_DIR, `${date}-offset-vs-cursor.md`);
		writeFileSync(outPath, report);

		console.log();
		console.log(chalk.green(`✅ Report written to ${outPath}`));
		console.log(
			chalk.magentaBright(
				`\n================ Benchmark Complete (${(totalWallMs / 1000).toFixed(1)}s) ================\n`,
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
