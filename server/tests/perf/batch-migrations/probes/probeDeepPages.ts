/** Verifies page cost is flat across page depth: times pages 1, 2, 100,
 * 6000, 11999 of the dashboard preview (pageSize 50) via real cursors. */

import { sql } from "drizzle-orm";
import { getCustomerPage } from "@/internal/migrations/v2/filters/customers/filterCustomers.js";
import {
	BENCH_PAID_PRODUCT_ID,
	getBenchContext,
} from "../utils/benchContext.js";

const PAGE_SIZE = 50;
const CHECKPOINTS = [1, 2, 100, 6000, 11_999];

const main = async () => {
	const { ctx } = await getBenchContext();

	let cursor: string | undefined;
	let page = 0;
	const started = Date.now();
	for (const target of CHECKPOINTS) {
		// Advance to the target page by walking cursors (cheap: each hop is one
		// paged query — this loop itself demonstrates flat per-page cost).
		let ms = 0;
		let rows: { internal_id: string }[] = [];
		while (page < target) {
			const pageStarted = Date.now();
			const result = await getCustomerPage({
				ctx,
				filter: { plan: { plan_id: BENCH_PAID_PRODUCT_ID } },
				pageSize: PAGE_SIZE,
				cursor,
			});
			ms = Date.now() - pageStarted;
			rows = result.rows;
			cursor = result.nextCursor ?? undefined;
			page++;
			if (!result.nextCursor) break;
		}
		console.log(
			`page ${page.toLocaleString()}: ${rows.length} rows in ${ms}ms (first=${rows[0]?.internal_id})`,
		);
	}
	console.log(`walked ${page.toLocaleString()} pages total in ${Math.round((Date.now() - started) / 1000)}s`);
	process.exit(0);
};

await main();
