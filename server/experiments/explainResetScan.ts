import "dotenv/config";
import { sql } from "drizzle-orm";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");
const {
	buildResetEligiblePageQuery,
	getResetEligibleCustomerEntitlementsPage,
} = await import(
	"../src/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage"
);
const { countResetEligibleCustomerEntitlements } = await import(
	"../src/internal/customers/cusProducts/cusEnts/repos/countResetEligibleCustomerEntitlements"
);

const main = async () => {
	const batchSizes = (process.env.BATCH_SIZES ?? "1000,10000,100000")
		.split(",")
		.map(Number);
	const walkPageSize = Number(process.env.WALK_PAGE_SIZE ?? 10_000);
	const walkPages = Number(process.env.WALK_PAGES ?? 20);
	const dueBefore = Date.now();
	const { db } = initDrizzle();

	const dbHost = new URL(process.env.DATABASE_URL ?? "").host;
	console.log(`DB target: ${dbHost}\n`);

	console.log("--- single page per batch size (cold, warm) ---");
	for (const limit of batchSizes) {
		for (const run of ["cold", "warm"]) {
			const start = performance.now();
			const page = await getResetEligibleCustomerEntitlementsPage({
				db,
				dueBefore,
				cursor: null,
				limit,
			});
			const elapsed = performance.now() - start;
			console.log(
				`[size=${limit}][${run}] rows=${page.length}, wall-clock=${elapsed.toFixed(0)}ms`,
			);
		}
	}

	console.log(
		`\n--- cursor walk: ${walkPages} pages x ${walkPageSize} rows ---`,
	);
	let cursor: { nextResetAt: number; id: string } | null = null;
	for (let page = 1; page <= walkPages; page++) {
		const start = performance.now();
		const rows = await getResetEligibleCustomerEntitlementsPage({
			db,
			dueBefore,
			cursor,
			limit: walkPageSize,
		});
		const elapsed = performance.now() - start;
		console.log(
			`[page ${page}] rows=${rows.length}, wall-clock=${elapsed.toFixed(0)}ms, depth=${(page * walkPageSize).toLocaleString()}`,
		);
		if (rows.length < walkPageSize) {
			console.log("(drained)");
			break;
		}
		const lastRow = rows[rows.length - 1];
		cursor = { nextResetAt: lastRow.nextResetAt, id: lastRow.id };
	}

	const maxSize = Math.max(...batchSizes);
	console.log(`\n--- EXPLAIN (ANALYZE, BUFFERS), size=${maxSize} ---`);
	const explainResult = await db.execute(
		sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${buildResetEligiblePageQuery(
			{
				db,
				dueBefore,
				cursor: null,
				limit: maxSize,
			},
		)}`,
	);
	for (const row of explainResult) {
		const line = (row as Record<string, unknown>)["QUERY PLAN"];
		if (typeof line === "string") console.log(line);
	}

	if (process.env.RUN_BACKLOG_COUNT === "true") {
		const start = performance.now();
		const result = await countResetEligibleCustomerEntitlements({
			db,
			dueBefore,
			cap: 1_000_000,
		});
		const elapsed = performance.now() - start;
		console.log(
			`\n[backlog] overdue-eligible rows=${result.count} (capped=${result.capped}), wall-clock=${elapsed.toFixed(0)}ms`,
		);
	}

	process.exit(0);
};

await main();
