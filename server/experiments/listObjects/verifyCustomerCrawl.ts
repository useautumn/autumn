import { AppEnv, RELEVANT_STATUSES } from "@autumn/shared";
import { initDrizzle } from "../../src/db/initDrizzle.js";
import { createDualLogger } from "../../src/external/logtail/logtailUtils.js";
import type { RequestContext } from "../../src/honoUtils/HonoEnv.js";
import { getPaginatedFullCusQuery } from "../../src/internal/customers/getFullCusQuery.js";
import {
	getMemoizedOffsetCursor,
	setMemoizedOffsetCursor,
} from "../../src/internal/customers/offsetCursorMemo.js";
import { createWorkerContext } from "../../src/queue/createWorkerContext.js";

/**
 * Walks N consecutive pages twice — once purely with OFFSET, once the way the
 * memo does it — and compares the full id sequence. This is the check that
 * matters: a crawl must return every customer exactly once, in the same order.
 *
 * Query-level on purpose: going through CusBatchService.getPage would fire
 * triggerBatchResetCustomerEntitlements and enqueue SQS jobs against prod.
 *
 * Run with:
 *   infisical run --env=prod --recursive -- bun run server/experiments/listObjects/verifyCustomerCrawl.ts
 */
const ORG_ID = process.env.ORG_ID || "biu9vSF7vghBLSKW1UTDwxHBAivjnPaK";
const ENV = (process.env.ENV as AppEnv) || AppEnv.Live;
const LIMIT = Number(process.env.LIMIT || 250);
const PAGES = Number(process.env.PAGES || 8);
const START_OFFSET = Number(process.env.OFFSET || 1_600_000);

// Filters change customerListFilterSql, which now sits directly above the
// pagination clause — worth crawling with them on.
const SEARCH = process.env.SEARCH || undefined;
const PLAN = process.env.PLAN || undefined;

type QueryArgs = Parameters<typeof getPaginatedFullCusQuery>[0];

const baseArgs: Omit<QueryArgs, "limit" | "offset" | "cursor"> = {
	orgId: ORG_ID,
	env: ENV,
	inStatuses: RELEVANT_STATUSES,
	includeInvoices: false,
	withEntities: false,
	withTrialsUsed: false,
	withSubs: true,
	cusProductLimit: 10,
	search: SEARCH,
	plans: PLAN ? [{ id: PLAN }] : undefined,
};

// Compare on internal_id: `id` is nullable, and collapsing nulls in a Set would
// hide real skips behind fake duplicates.
type Row = { id: string | null; internal_id: string; created_at: number };

const main = async () => {
	const { db } = initDrizzle({ maxConnections: 2 });

	// Both crawls must read ONE snapshot. firecrawl inserts continuously, and new
	// rows sort first under created_at DESC, so every offset shifts underneath a
	// crawl that takes 35s — which reads as a diff when nothing is wrong. That
	// drift is precisely what keyset removes, so measuring it as a failure would
	// be measuring the bug we're fixing.
	await db.transaction(
		async (tx) => {
			await runCrawls({
				fetchPage: async ({ offset, cursor }) =>
					(await tx.execute(
						getPaginatedFullCusQuery({
							...baseArgs,
							limit: LIMIT,
							offset,
							cursor,
						}),
					)) as unknown as Row[],
			});
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);

	await runRedisProbe({ db });
	process.exit(exitCode);
};

let exitCode = 0;

const runCrawls = async ({
	fetchPage,
}: {
	fetchPage: (args: {
		offset: number;
		cursor?: { t: number; id: string };
	}) => Promise<Row[]>;
}) => {

	// -- Crawl A: pure OFFSET, exactly what prod does today --
	const offsetIds: string[] = [];
	const offsetPageMs: number[] = [];
	for (let page = 0; page < PAGES; page++) {
		const startedAt = performance.now();
		const rows = await fetchPage({ offset: START_OFFSET + page * LIMIT });
		offsetPageMs.push(performance.now() - startedAt);
		offsetIds.push(...rows.map((row) => row.internal_id));
	}
	const offsetMs = offsetPageMs.reduce((sum, ms) => sum + ms, 0);

	// -- Crawl B: memo path. Page 1 always misses (nothing memoized yet) and
	// pays full OFFSET; every page after it seeks. --
	const memoIds: string[] = [];
	const memoPageMs: number[] = [];
	let cursor: { t: number; id: string } | undefined;
	for (let page = 0; page < PAGES; page++) {
		const startedAt = performance.now();
		const rows = await fetchPage({
			offset: START_OFFSET + page * LIMIT,
			cursor,
		});
		memoPageMs.push(performance.now() - startedAt);
		memoIds.push(...rows.map((row) => row.internal_id));
		const last = rows[rows.length - 1];
		cursor = last?.id ? { t: Number(last.created_at), id: last.id } : undefined;
	}
	const memoMs = memoPageMs.reduce((sum, ms) => sum + ms, 0);

	const mean = ({ values }: { values: number[] }) =>
		values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

	const describe = ({ label, ids }: { label: string; ids: string[] }) => {
		const unique = new Set(ids);
		console.log(
			`${label.padEnd(18)} rows=${String(ids.length).padStart(5)}  unique=${String(unique.size).padStart(5)}  dupes=${ids.length - unique.size}`,
		);
		return unique;
	};

	console.log(
		`\ncrawl of ${PAGES} pages x ${LIMIT} from offset ${START_OFFSET}\n`,
	);
	const offsetUnique = describe({ label: "OFFSET crawl", ids: offsetIds });
	const memoUnique = describe({ label: "memo crawl", ids: memoIds });

	const sameOrder =
		offsetIds.length === memoIds.length &&
		offsetIds.every((id, index) => id === memoIds[index]);
	const missing = [...offsetUnique].filter((id) => !memoUnique.has(id));
	const extra = [...memoUnique].filter((id) => !offsetUnique.has(id));

	console.log(
		`\nsame order:      ${sameOrder ? "YES" : "NO"}\nmissing in memo: ${missing.length}\nextra in memo:   ${extra.length}`,
	);
	if (missing.length) console.log(`  missing sample: ${missing.slice(0, 5)}`);
	if (extra.length) console.log(`  extra sample:   ${extra.slice(0, 5)}`);

	console.log(
		`\ntotal: OFFSET ${(offsetMs / 1000).toFixed(2)}s -> memo ${(memoMs / 1000).toFixed(2)}s  (${(offsetMs / memoMs).toFixed(1)}x)`,
	);
	console.log(
		`per page (ms): OFFSET  ${offsetPageMs.map((ms) => ms.toFixed(0).padStart(5)).join(" ")}`,
	);
	console.log(
		`per page (ms): memo    ${memoPageMs.map((ms) => ms.toFixed(0).padStart(5)).join(" ")}   <- page 1 is a miss by design`,
	);

	// Steady state is what a crawl actually pays: page 1 misses once, then every
	// subsequent page seeks.
	const offsetSteady = mean({ values: offsetPageMs.slice(1) });
	const memoSteady = mean({ values: memoPageMs.slice(1) });
	console.log(
		`steady-state page: OFFSET ${offsetSteady.toFixed(0)}ms -> memo ${memoSteady.toFixed(0)}ms  (${(offsetSteady / memoSteady).toFixed(1)}x)`,
	);

	const pass = sameOrder && missing.length === 0 && extra.length === 0;
	console.log(`\n${pass ? "PASS" : "FAIL — DO NOT SHIP"}`);
	exitCode = pass ? 0 : 1;
};

/** Redis wiring the query-level crawl can't cover. */
const runRedisProbe = async ({
	db,
}: {
	db: ReturnType<typeof initDrizzle>["db"];
}) => {
	const ctx = (await createWorkerContext({
		db,
		payload: { orgId: ORG_ID, env: ENV },
		logger: createDualLogger(),
		skipCache: true,
	})) as RequestContext | undefined;

	if (ctx) {
		const probeOffset = 987_654;
		const stored = { t: 1_700_000_000_000, id: "crawl-probe" };
		await setMemoizedOffsetCursor({
			ctx,
			query: { search: "crawl-probe" },
			nextOffset: probeOffset,
			lastRow: stored,
		});
		const readBack = await getMemoizedOffsetCursor({
			ctx,
			query: { search: "crawl-probe" },
			offset: probeOffset,
		});
		const differentFilter = await getMemoizedOffsetCursor({
			ctx,
			query: { search: "a-different-filter" },
			offset: probeOffset,
		});
		console.log(
			`\nredis round-trip: ${readBack?.id === stored.id && readBack?.t === stored.t ? "OK" : `FAILED (${JSON.stringify(readBack)})`}`,
		);
		console.log(
			`filter isolation: ${differentFilter === null ? "OK (different filter misses)" : "FAILED — key collision"}`,
		);
	}
};

await main();
