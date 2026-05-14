import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { CusBatchService } from "../src/internal/customers/CusBatchService";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";
const ENV = AppEnv.Sandbox;
const PAGE_SIZE = parseInt(process.env.PAGE_SIZE ?? "100", 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES ?? "50", 10);

const minimalCtx = () => {
	const { db, client } = initDrizzle();
	return {
		db,
		client,
		org: { id: ORG_ID, slug: "unit-test-org" },
		env: ENV,
		logger: {
			info: () => {},
			error: () => {},
			warn: () => {},
			debug: () => {},
			trace: () => {},
		},
	} as any;
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			"\n================ Dashboard Cursor No-Skip Sweep ================\n",
		),
	);

	const ctx = minimalCtx();

	try {
		const seen = new Set<string>();
		const duplicates: string[] = [];
		const order: string[] = [];

		let cursor: { t: number; id: string } | null = null;
		let pageNum = 0;
		while (pageNum < MAX_PAGES) {
			const res: { fullCustomers: any[]; next_cursor: string | null } =
				await CusBatchService.getDashboardCursorPage({
					ctx,
					search: "",
					filters: undefined,
					cursor,
					limit: PAGE_SIZE,
				});
			pageNum++;

			for (const c of res.fullCustomers) {
				if (seen.has(c.internal_id)) duplicates.push(c.internal_id);
				seen.add(c.internal_id);
				order.push(c.internal_id);
			}

			console.log(
				chalk.gray(
					`  page ${pageNum.toString().padStart(3)}  rows=${res.fullCustomers.length.toString().padStart(4)}  total=${seen.size.toString().padStart(6)}  next=${res.next_cursor ? "yes" : "no"}`,
				),
			);

			if (!res.next_cursor) break;
			const decoded = JSON.parse(
				Buffer.from(res.next_cursor, "base64").toString("utf8"),
			);
			cursor = { t: decoded.t, id: decoded.id };
		}

		const expected = (
			(await ctx.db.execute(
				sql`
					SELECT c.internal_id
					FROM customers c
					WHERE c.org_id = ${ORG_ID} AND c.env = ${ENV}
					ORDER BY c.created_at DESC, c.id DESC
					LIMIT ${pageNum * PAGE_SIZE}
				`,
			)) as unknown as { internal_id: string }[]
		).map((r) => r.internal_id);

		console.log();
		console.log(
			chalk.bold(
				`  Walked ${pageNum} pages, saw ${seen.size} unique customers (expected first ${expected.length}).`,
			),
		);

		if (duplicates.length > 0) {
			console.log(
				chalk.red(`  ❌ ${duplicates.length} duplicates returned across pages`),
			);
		} else {
			console.log(chalk.green(`  ✓ no duplicates`));
		}

		const missing: string[] = [];
		for (const id of expected) if (!seen.has(id)) missing.push(id);
		if (missing.length > 0) {
			console.log(
				chalk.red(
					`  ❌ ${missing.length} customers skipped! First 5: ${missing.slice(0, 5).join(", ")}`,
				),
			);
		} else {
			console.log(chalk.green(`  ✓ no customers skipped`));
		}

		const sameOrder = order.every((id, i) => id === expected[i]);
		console.log(
			sameOrder
				? chalk.green(`  ✓ pagination order matches direct query`)
				: chalk.yellow(`  ⚠ pagination order differs from direct query`),
		);

		process.exit(missing.length === 0 && duplicates.length === 0 ? 0 : 1);
	} finally {
		await ctx.client.end();
	}
};

await main();
