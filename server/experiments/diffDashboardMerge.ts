import {
	AppEnv,
	type FullCustomer,
	RELEVANT_STATUSES,
	StandardCursor,
} from "@autumn/shared";
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

type DashboardFilters = {
	status?: string[];
	version?: string[];
	none?: boolean;
	processor?: string[];
};

const runOldPath = async ({
	ctx,
	search,
	filters,
	cursor,
	limit,
}: {
	ctx: any;
	search: string;
	filters?: DashboardFilters;
	cursor: { t: number; id: string } | null;
	limit: number;
}): Promise<{
	fullCustomers: FullCustomer[];
	next_cursor: string | null;
}> => {
	const { internalIds, peek } =
		await CusSearchService.resolveInternalIdsByCursor({
			db: ctx.db,
			orgId: ORG_ID,
			env: ENV,
			search,
			filters,
			cursor,
			limit,
		});
	if (internalIds.length === 0) {
		return { fullCustomers: [], next_cursor: null };
	}
	const query = getCursorPaginatedFullCusQuery({
		orgId: ORG_ID,
		env: ENV,
		inStatuses: RELEVANT_STATUSES,
		withSubs: true,
		limit: internalIds.length,
		internalCustomerIds: internalIds,
		cusProductLimit: 15,
	});
	const rows = (await ctx.db.execute(query)) as unknown as Record<
		string,
		unknown
	>[];
	const flat = (rows[0] ?? {
		customers: [],
		customer_products: [],
		customer_entitlements: [],
		extra_customer_entitlements: [],
		customer_prices: [],
		entitlements: [],
		rollovers: [],
		replaceables: [],
		free_trials: [],
		subscriptions: [],
	}) as unknown as FlattenedCustomerRow;
	const fullCustomers = reassembleFlattenedCustomer(flat);
	const next_cursor = peek ? StandardCursor.encode(peek) : null;
	return { fullCustomers, next_cursor };
};

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

const sortById = <T extends { internal_id?: string; id?: string | null }>(
	arr: T[],
): T[] =>
	[...arr].sort((a, b) =>
		(a.internal_id ?? a.id ?? "").localeCompare(b.internal_id ?? b.id ?? ""),
	);

const sortDeep = (obj: unknown): unknown => {
	if (Array.isArray(obj)) {
		const sorted = obj.map(sortDeep);
		if (sorted.length > 0 && typeof sorted[0] === "object" && sorted[0] !== null) {
			(sorted as any[]).sort((a, b) => {
				const ka = (a as any).id ?? (a as any).internal_id ?? "";
				const kb = (b as any).id ?? (b as any).internal_id ?? "";
				return String(ka).localeCompare(String(kb));
			});
		}
		return sorted;
	}
	if (obj && typeof obj === "object") {
		return Object.fromEntries(
			Object.entries(obj as Record<string, unknown>)
				.map(([k, v]) => [k, sortDeep(v)] as const)
				.sort(([a], [b]) => a.localeCompare(b)),
		);
	}
	return obj;
};

const diffCustomers = (
	a: FullCustomer[],
	b: FullCustomer[],
	label: string,
) => {
	if (a.length !== b.length) {
		console.log(
			chalk.red(
				`  ${label} ✗ length mismatch: old=${a.length} new=${b.length}`,
			),
		);
		return false;
	}
	const sa = sortById(a);
	const sb = sortById(b);
	let mismatches = 0;
	for (let i = 0; i < sa.length; i++) {
		const ja = JSON.stringify(sortDeep(sa[i]));
		const jb = JSON.stringify(sortDeep(sb[i]));
		if (ja !== jb) {
			if (mismatches < 2) {
				console.log(
					chalk.red(
						`  ${label} ✗ customer #${i} (${(sa[i] as any).id}) differs`,
					),
				);
				const keysA = Object.keys(sortDeep(sa[i]) as object);
				for (const k of keysA) {
					const va = JSON.stringify((sortDeep(sa[i]) as any)[k]);
					const vb = JSON.stringify((sortDeep(sb[i]) as any)[k]);
					if (va !== vb) {
						console.log(
							chalk.gray(`      KEY ${k}\n        old=${va?.slice(0, 160)}\n        new=${vb?.slice(0, 160)}`),
						);
					}
				}
			}
			mismatches++;
		}
	}
	if (mismatches > 0) {
		console.log(
			chalk.red(`  ${label} ✗ ${mismatches}/${sa.length} customers differ`),
		);
		return false;
	}
	console.log(chalk.green(`  ${label} ✓ ${sa.length} customers identical`));
	return true;
};

type Case = {
	name: string;
	search?: string;
	filters?: DashboardFilters;
	cursor?: { t: number; id: string } | null;
	limit?: number;
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			"\n================ Dashboard Merge Parity ================\n",
		),
	);

	const ctx = minimalCtx();

	const total = (
		(await ctx.db.execute(
			sql`SELECT COUNT(*)::int AS n FROM customers WHERE org_id = ${ORG_ID} AND env = ${ENV}`,
		)) as unknown as { n: number }[]
	)[0].n;
	const deepOffset = Math.floor(total * 0.95);
	const deepRow = (await ctx.db.execute(
		sql`SELECT created_at, id FROM customers WHERE org_id = ${ORG_ID} AND env = ${ENV} ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET ${deepOffset}`,
	)) as unknown as { created_at: number; id: string }[];
	const deepCursor = {
		t: Number(deepRow[0].created_at),
		id: deepRow[0].id,
	};
	console.log(
		chalk.gray(
			`  total=${total.toLocaleString()}  deep_cursor=${deepCursor.id} (offset ~95%)\n`,
		),
	);

	const cases: Case[] = [
		{ name: "baseline", limit: 200 },
		{ name: "search 'bench_000450'", search: "bench_000450", limit: 100 },
		{ name: "status=active", filters: { status: ["active"] }, limit: 200 },
		{ name: "status=past_due", filters: { status: ["past_due"] }, limit: 200 },
		{ name: "status=canceled", filters: { status: ["canceled"] }, limit: 200 },
		{
			name: "status=free_trial",
			filters: { status: ["free_trial"] },
			limit: 200,
		},
		{ name: "status=expired", filters: { status: ["expired"] }, limit: 200 },
		{
			name: "status=active,past_due",
			filters: { status: ["active", "past_due"] },
			limit: 200,
		},
		{ name: "none=true", filters: { none: true }, limit: 200 },
		{
			name: "processor=stripe",
			filters: { processor: ["stripe"] },
			limit: 200,
		},
		{ name: "deep cursor (95%)", cursor: deepCursor, limit: 200 },
		{
			name: "deep cursor + status=active",
			cursor: deepCursor,
			filters: { status: ["active"] },
			limit: 200,
		},
		{
			name: "search no-match",
			search: "no_such_customer_zzz",
			limit: 50,
		},
	];

	let pass = 0;
	let fail = 0;
	try {
		for (const tc of cases) {
			const args = {
				ctx,
				search: tc.search ?? "",
				filters: tc.filters,
				cursor: tc.cursor ?? null,
				limit: tc.limit ?? 200,
			};
			const oldRes = await runOldPath(args);
			const newRes = await CusBatchService.getDashboardCursorPage(args);
			const ok = diffCustomers(
				oldRes.fullCustomers,
				newRes.fullCustomers,
				tc.name,
			);
			const oldDecoded = StandardCursor.decode(oldRes.next_cursor ?? "");
			const newDecoded = StandardCursor.decode(newRes.next_cursor ?? "");
			const cursorMatches =
				(oldDecoded?.t ?? null) === (newDecoded?.t ?? null) &&
				(oldDecoded?.id ?? null) === (newDecoded?.id ?? null);
			if (!cursorMatches) {
				console.log(
					chalk.yellow(
						`    cursor differs: old=${JSON.stringify(oldDecoded)} new=${JSON.stringify(newDecoded)}`,
					),
				);
			}
			if (ok && cursorMatches) pass++;
			else fail++;
		}

		console.log();
		console.log(
			chalk.bold(
				`Result: ${chalk.green(`${pass} pass`)} / ${chalk.red(`${fail} fail`)} of ${cases.length}`,
			),
		);
	} finally {
		await ctx.client.end();
		process.exit(fail === 0 ? 0 : 1);
	}
};

await main();
