import {
	type AppEnv,
	type CusProductStatus,
	type FullCustomer,
	type ListCustomersV2Params,
	RELEVANT_STATUSES,
} from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";
import { getPaginatedFullCusQuery } from "../src/internal/customers/getFullCusQuery";
import {
	type FlattenedCustomerRow,
	reassembleFlattenedCustomer,
} from "../src/internal/customers/reassembleFlattenedCustomer";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const ORGS: { id: string; env: AppEnv; label: string }[] = [
	{ id: "biu9vSF7vghBLSKW1UTDwxHBAivjnPaK", env: "live" as AppEnv, label: "firecrawl" },
	{ id: "r7pwHiekGsqt32qGqcVku6thWFh5aHh8", env: "live" as AppEnv, label: "runable" },
];
const LIMIT = parseInt(process.env.DIFF_LIMIT ?? "50", 10);
const DEEP_OFFSET = parseInt(process.env.DIFF_DEEP_OFFSET ?? "500", 10);
const CUS_PRODUCT_LIMIT = 15;
const STATEMENT_TIMEOUT_MS = 30_000;

type ResolvedParams = Partial<ListCustomersV2Params> & {
	offset?: number;
	cursor?: { t: number; id: string };
};

type CaseContext = { db: DB; orgId: string; env: AppEnv };
type Case = {
	name: string;
	build: (ctx: CaseContext) => Promise<ResolvedParams | null>;
};

type DB = ReturnType<typeof initDrizzle>["db"];

const runReadOnly = async <T,>(db: DB, fn: (tx: any) => Promise<T>): Promise<T> => {
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		return fn(tx);
	});
};

const v22NormalizeTimestamp = (value: any): number => {
	if (typeof value === "string") {
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? Date.now() : parsed;
	}
	return typeof value === "number" ? value : Date.now();
};

const v22Normalize = (raw: any): any => {
	const out = {
		...raw,
		created_at: v22NormalizeTimestamp(raw.created_at),
	};
	if (raw.customer_products && Array.isArray(raw.customer_products)) {
		out.customer_products = raw.customer_products.map((cp: any) => ({
			...cp,
			created_at: v22NormalizeTimestamp(cp.created_at),
			starts_at: cp.starts_at
				? v22NormalizeTimestamp(cp.starts_at)
				: v22NormalizeTimestamp(cp.created_at),
			canceled_at: cp.canceled_at ? v22NormalizeTimestamp(cp.canceled_at) : null,
			ended_at: cp.ended_at ? v22NormalizeTimestamp(cp.ended_at) : null,
			trial_ends_at: cp.trial_ends_at
				? v22NormalizeTimestamp(cp.trial_ends_at)
				: null,
			quantity: cp.quantity ? parseInt(cp.quantity, 10) || 1 : 1,
			options: cp.options || [],
			collection_method: cp.collection_method || "charge_automatically",
			subscription_ids: cp.subscription_ids || [],
			scheduled_ids: cp.scheduled_ids || [],
			customer_entitlements: (cp.customer_entitlements || []).map((ce: any) => ({
				...ce,
				created_at: v22NormalizeTimestamp(ce.created_at),
				next_reset_at: ce.next_reset_at
					? v22NormalizeTimestamp(ce.next_reset_at)
					: null,
				balance: ce.balance ? parseFloat(ce.balance) || 0 : 0,
				adjustment: ce.adjustment ? parseFloat(ce.adjustment) || 0 : 0,
			})),
		}));
	}
	return out;
};

const fetchV22 = async (
	db: DB,
	orgId: string,
	env: AppEnv,
	params: ResolvedParams,
) => {
	const { subscription_status, plans, search, processors, offset = 0 } = params;
	const query = getPaginatedFullCusQuery({
		orgId,
		env,
		inStatuses: subscription_status
			? [subscription_status as unknown as CusProductStatus]
			: RELEVANT_STATUSES,
		includeInvoices: false,
		withEntities: false,
		withTrialsUsed: false,
		withSubs: true,
		limit: LIMIT,
		offset,
		search,
		plans,
		processors,
		cusProductLimit: CUS_PRODUCT_LIMIT,
	});
	const rows = await runReadOnly(db, (tx) => tx.execute(query));
	return (rows as any[]).map(v22Normalize) as FullCustomer[];
};

const fetchV23 = async (
	db: DB,
	orgId: string,
	env: AppEnv,
	params: ResolvedParams,
) => {
	const { subscription_status, plans, search, processors, cursor } = params;
	const query = getCursorPaginatedFullCusQuery({
		orgId,
		env,
		inStatuses: subscription_status
			? [subscription_status as unknown as CusProductStatus]
			: RELEVANT_STATUSES,
		withSubs: true,
		limit: LIMIT,
		search,
		plans,
		processors,
		cursor: cursor ? { v: 0 as const, t: cursor.t, id: cursor.id } : undefined,
		cusProductLimit: CUS_PRODUCT_LIMIT,
	});
	const rows = (await runReadOnly(db, (tx) => tx.execute(query))) as any[];
	const flat = (rows[0] ?? {}) as unknown as FlattenedCustomerRow;
	const all = reassembleFlattenedCustomer(flat);
	return all.slice(0, LIMIT);
};

const resolveCursorAtOffset = async ({
	db,
	orgId,
	env,
	offset,
	inStatuses,
	plans,
	processors,
	search,
}: {
	db: DB;
	orgId: string;
	env: AppEnv;
	offset: number;
	inStatuses?: CusProductStatus[];
	plans?: ListCustomersV2Params["plans"];
	processors?: ListCustomersV2Params["processors"];
	search?: string;
}): Promise<{ t: number; id: string } | null> => {
	const query = getPaginatedFullCusQuery({
		orgId,
		env,
		inStatuses: inStatuses ?? RELEVANT_STATUSES,
		includeInvoices: false,
		withEntities: false,
		withTrialsUsed: false,
		withSubs: false,
		limit: 1,
		offset: offset - 1,
		search,
		plans,
		processors,
		cusProductLimit: 1,
	});
	const rows = (await runReadOnly(db, (tx) => tx.execute(query))) as any[];
	if (rows.length === 0) return null;
	const row = rows[0] as { id: string; created_at: number | string };
	return { t: v22NormalizeTimestamp(row.created_at), id: row.id };
};

const resolveFirstPlanId = async ({
	db,
	orgId,
	env,
}: {
	db: DB;
	orgId: string;
	env: AppEnv;
}): Promise<string | null> => {
	const rows = (await runReadOnly(
		db,
		(tx) => tx.execute(sql`
			SELECT p.id
			FROM products p
			JOIN customer_products cp ON cp.internal_product_id = p.internal_id
			WHERE p.org_id = ${orgId} AND p.env = ${env}
			GROUP BY p.id
			ORDER BY COUNT(*) DESC
			LIMIT 1
		`),
	)) as any[];
	return rows[0]?.id ?? null;
};

const resolveSearchSubstring = async ({
	db,
	orgId,
	env,
}: {
	db: DB;
	orgId: string;
	env: AppEnv;
}): Promise<string | null> => {
	const rows = (await runReadOnly(
		db,
		(tx) => tx.execute(sql`
			SELECT c.email
			FROM customers c
			WHERE c.org_id = ${orgId} AND c.env = ${env}
				AND c.email IS NOT NULL
				AND length(c.email) >= 5
			LIMIT 1
		`),
	)) as any[];
	const email = rows[0]?.email as string | undefined;
	if (!email) return null;
	const at = email.indexOf("@");
	if (at < 3) return email.slice(0, 3);
	return email.slice(0, Math.min(at, 4));
};

const CASES: Case[] = [
	{
		name: "page 1 / no filters",
		build: async () => ({}),
	},
	{
		name: "page 1 / subscription_status=active",
		build: async () => ({ subscription_status: "active" }),
	},
	{
		name: "page 1 / processors=revenuecat",
		build: async () => ({ processors: ["revenuecat"] }),
	},
	{
		name: "page 1 / search",
		build: async (ctx) => {
			const search = await resolveSearchSubstring(ctx);
			if (!search) return null;
			return { search };
		},
	},
	{
		name: "page 1 / plans",
		build: async (ctx) => {
			const planId = await resolveFirstPlanId(ctx);
			if (!planId) return null;
			return { plans: [{ id: planId }] };
		},
	},
	{
		name: `deep / offset=${DEEP_OFFSET} / no filters`,
		build: async (ctx) => {
			const cursor = await resolveCursorAtOffset({
				db: ctx.db,
				orgId: ctx.orgId,
				env: ctx.env,
				offset: DEEP_OFFSET,
			});
			if (!cursor) return null;
			return { offset: DEEP_OFFSET, cursor };
		},
	},
];

const findDiff = (a: any, b: any, path = "$"): string | null => {
	if (a === b) return null;
	if (a === null || b === null || a === undefined || b === undefined) {
		return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
	}
	if (typeof a !== typeof b) {
		return `${path}: type ${typeof a} vs ${typeof b}`;
	}
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b)) {
			return `${path}: array vs non-array`;
		}
		if (a.length !== b.length) {
			return `${path}.length: ${a.length} vs ${b.length}`;
		}
		for (let i = 0; i < a.length; i++) {
			const d = findDiff(a[i], b[i], `${path}[${i}]`);
			if (d) return d;
		}
		return null;
	}
	if (typeof a === "object") {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) {
			const d = findDiff(a[k], b[k], `${path}.${k}`);
			if (d) return d;
		}
		return null;
	}
	return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
};

const summarize = (label: string, list: FullCustomer[]) => {
	const cps = list.reduce((n, c) => n + (c.customer_products?.length ?? 0), 0);
	const subs = list.reduce(
		(n, c) => n + (c.subscriptions?.length ?? 0),
		0,
	);
	const extras = list.reduce(
		(n, c) => n + (c.extra_customer_entitlements?.length ?? 0),
		0,
	);
	return `${label}: ${list.length} cus / ${cps} cps / ${subs} subs / ${extras} loose_ces`;
};

const runOrg = async ({
	db,
	orgId,
	env,
	label,
}: {
	db: DB;
	orgId: string;
	env: AppEnv;
	label: string;
}) => {
	console.log(
		chalk.magentaBright(
			`\n========= ${label} (${orgId}) env=${env} limit=${LIMIT} =========\n`,
		),
	);
	let total = 0;
	let passes = 0;
	for (const c of CASES) {
		total++;
		console.log(chalk.cyan(`\n--- ${c.name} ---`));
		const params = await c.build({ db, orgId, env });
		if (!params) {
			console.log(chalk.yellow("  ⊘ skipped (no data to build params)"));
			passes++;
			continue;
		}
		console.log(
			chalk.gray(
				`  params: ${JSON.stringify(params, (_k, v) => (typeof v === "bigint" ? String(v) : v))}`,
			),
		);
		const [v22, v23] = await Promise.all([
			fetchV22(db, orgId, env, params),
			fetchV23(db, orgId, env, params),
		]);
		console.log(chalk.gray(`  ${summarize("V2.2", v22)}`));
		console.log(chalk.gray(`  ${summarize("V2.3", v23)}`));
		const diff = findDiff(v22, v23);
		if (diff) {
			console.log(chalk.red(`  ❌ DIFF at ${diff}`));
			const idx = diff.match(/\$\[(\d+)\]/);
			if (idx) {
				const i = parseInt(idx[1]!, 10);
				console.log(chalk.gray(`  --- V2.2 [${i}] ---`));
				console.log(chalk.gray(JSON.stringify(v22[i], null, 2).slice(0, 4000)));
				console.log(chalk.gray(`  --- V2.3 [${i}] ---`));
				console.log(chalk.gray(JSON.stringify(v23[i], null, 2).slice(0, 4000)));
			}
		} else {
			console.log(chalk.green(`  ✓ MATCH`));
			passes++;
		}
	}
	console.log(
		chalk.magentaBright(`\n  ${label}: ${passes}/${total} cases match`),
	);
	return { total, passes };
};

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		let grandTotal = 0;
		let grandPasses = 0;
		for (const org of ORGS) {
			try {
				const { total, passes } = await runOrg({
					db,
					orgId: org.id,
					env: org.env,
					label: org.label,
				});
				grandTotal += total;
				grandPasses += passes;
			} catch (err) {
				console.error(chalk.red(`\n❌ Org ${org.label} failed:`), err);
			}
		}
		console.log(
			chalk.magentaBright(
				`\n========= TOTAL: ${grandPasses}/${grandTotal} cases match =========\n`,
			),
		);
	} catch (error) {
		console.error(chalk.red("\n❌ Diff failed:"));
		console.error(error);
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
