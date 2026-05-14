import { AppEnv, RELEVANT_STATUSES } from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { CusBatchService } from "../src/internal/customers/CusBatchService";
import { CusSearchService } from "../src/internal/customers/CusSearchService";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";
import { initDrizzle } from "../src/db/initDrizzle";
import {
	type FlattenedCustomerRow,
	reassembleFlattenedCustomer,
} from "../src/internal/customers/reassembleFlattenedCustomer";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";
const ENV = AppEnv.Sandbox;
const REPEATS = 5;
const LIMIT = parseInt(process.env.LIMIT ?? "500", 10);
const OFFSET_PCT = parseInt(process.env.OFFSET_PCT ?? "95", 10);

const main = async () => {
	console.log(
		chalk.magentaBright(
			"\n================ Dashboard Merge Bench ================\n",
		),
	);
	const { db, client } = initDrizzle();
	const ctx = {
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

	try {
		const total = (
			(await db.execute(
				sql`SELECT COUNT(*)::int AS n FROM customers WHERE org_id = ${ORG_ID} AND env = ${ENV}`,
			)) as unknown as { n: number }[]
		)[0].n;
		const offset = Math.floor((total * OFFSET_PCT) / 100);
		const row = (await db.execute(
			sql`SELECT created_at, id FROM customers WHERE org_id = ${ORG_ID} AND env = ${ENV} ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET ${offset}`,
		)) as unknown as { created_at: number; id: string }[];
		const cursor = { t: Number(row[0].created_at), id: row[0].id };
		console.log(
			chalk.gray(
				`  total=${total.toLocaleString()}  cursor at ${OFFSET_PCT}%: ${cursor.id}  limit=${LIMIT}\n`,
			),
		);

		const measure = async (label: string, fn: () => Promise<void>) => {
			for (let i = 0; i < 2; i++) await fn();
			const samples: number[] = [];
			for (let i = 0; i < REPEATS; i++) {
				const t0 = performance.now();
				await fn();
				samples.push(performance.now() - t0);
			}
			samples.sort((a, b) => a - b);
			const p50 = samples[Math.floor(samples.length / 2)];
			const min = samples[0];
			const max = samples[samples.length - 1];
			console.log(
				`  ${chalk.cyan(label.padEnd(20))} p50=${p50.toFixed(0).padStart(4)}ms min=${min.toFixed(0).padStart(4)}ms max=${max.toFixed(0).padStart(4)}ms`,
			);
			return p50;
		};

		const oldPath = async () => {
			const { internalIds } =
				await CusSearchService.resolveInternalIdsByCursor({
					db,
					orgId: ORG_ID,
					env: ENV,
					search: "",
					cursor,
					limit: LIMIT,
				});
			if (internalIds.length === 0) return;
			const query = getCursorPaginatedFullCusQuery({
				orgId: ORG_ID,
				env: ENV,
				inStatuses: RELEVANT_STATUSES,
				withSubs: true,
				limit: internalIds.length,
				internalCustomerIds: internalIds,
				cusProductLimit: 15,
			});
			const rows = (await db.execute(query)) as unknown as Record<
				string,
				unknown
			>[];
			const flat = (rows[0] ?? {}) as unknown as FlattenedCustomerRow;
			reassembleFlattenedCustomer(flat);
		};

		const newPath = async () => {
			await CusBatchService.getDashboardCursorPage({
				ctx,
				search: "",
				filters: undefined,
				cursor,
				limit: LIMIT,
			});
		};

		const oldWithStatus = async () => {
			// Call old path manually (resolve + fetch) with status filter for parity
			await oldPath();
		};

		const newWithStatus = async () => {
			await CusBatchService.getDashboardCursorPage({
				ctx,
				search: "",
				filters: { status: ["active"] },
				cursor,
				limit: LIMIT,
			});
		};

		const oldP50 = await measure("OLD (resolve+fetch)", oldPath);
		const newP50 = await measure("NEW (no filters)", newPath);
		const newStatusP50 = await measure(
			"NEW (status=active)",
			newWithStatus,
		);

		console.log();
		console.log(chalk.magentaBright("================ Summary ================"));
		const delta = (((newP50 - oldP50) / oldP50) * 100).toFixed(0);
		console.log(
			`  old → new (no filters):  ${oldP50.toFixed(0)}ms → ${newP50.toFixed(0)}ms  (${delta}%)`,
		);
		console.log(
			`  new with status=active:  ${newStatusP50.toFixed(0)}ms  (uses resolve+fetch fallback)`,
		);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
