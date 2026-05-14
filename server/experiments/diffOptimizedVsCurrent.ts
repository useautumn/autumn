import { AppEnv } from "@autumn/shared";
import type { FlattenedCustomerRow } from "../src/internal/customers/reassembleFlattenedCustomer/index.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";
import { getCursorPaginatedFullCusQuery } from "../src/internal/customers/cursorPaginatedFullCusQuery";
import { reassembleFlattenedCustomer } from "../src/internal/customers/reassembleFlattenedCustomer";
import { getOptimizedFullCusQuery } from "./optimizedFullCusQuery";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";

type Args = {
	orgId: string;
	env: AppEnv;
	inStatuses: typeof RELEVANT_STATUSES;
	withSubs: boolean;
	limit: number;
	cusProductLimit: number;
};

const sharedArgs: Args & {
	cursor?: { v: 0; t: number; id: string };
} = {
	orgId: ORG_ID,
	env: AppEnv.Sandbox,
	inStatuses: RELEVANT_STATUSES,
	withSubs: true,
	limit: parseInt(process.env.LIMIT ?? "50", 10),
	cusProductLimit: 15,
};

type AnyRecord = Record<string, unknown>;

const fetchFlat = async (
	db: ReturnType<typeof initDrizzle>["db"],
	q: any,
): Promise<FlattenedCustomerRow> => {
	const rows = await db.execute(q);
	const flat = (rows as unknown as AnyRecord[])[0] as unknown as FlattenedCustomerRow;
	return flat;
};

const sortById = (a: { id?: string }, b: { id?: string }) =>
	(a.id ?? "").localeCompare(b.id ?? "");

const sortDeep = (obj: unknown): unknown => {
	if (Array.isArray(obj)) {
		const sorted = obj.map(sortDeep);
		if (sorted.length > 0 && typeof sorted[0] === "object" && sorted[0] !== null) {
			(sorted as AnyRecord[]).sort((a, b) => {
				const ka = (a as AnyRecord).id ?? (a as AnyRecord).internal_id ?? "";
				const kb = (b as AnyRecord).id ?? (b as AnyRecord).internal_id ?? "";
				return String(ka).localeCompare(String(kb));
			});
		}
		return sorted;
	}
	if (obj && typeof obj === "object") {
		const entries = Object.entries(obj as AnyRecord)
			.map(([k, v]) => [k, sortDeep(v)] as const)
			.sort(([a], [b]) => a.localeCompare(b));
		return Object.fromEntries(entries);
	}
	return obj;
};

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		const offsetPct = parseInt(process.env.OFFSET_PCT ?? "0", 10);
		if (offsetPct > 0) {
			const total = (await db.execute(
				sql`SELECT COUNT(*)::int AS n FROM customers WHERE org_id = ${ORG_ID} AND env = 'sandbox'`,
			)) as unknown as { n: number }[];
			const offset = Math.floor((total[0].n * offsetPct) / 100);
			const row = (await db.execute(
				sql`SELECT created_at, id FROM customers WHERE org_id = ${ORG_ID} AND env = 'sandbox' ORDER BY created_at DESC, id DESC LIMIT 1 OFFSET ${offset}`,
			)) as unknown as { created_at: number; id: string }[];
			sharedArgs.cursor = { v: 0, t: row[0].created_at, id: row[0].id };
			console.log(chalk.cyan(`Using deep cursor at ${offsetPct}%: ${row[0].id}`));
		}

		console.log(chalk.cyan(`Running CURRENT query (limit=${sharedArgs.limit}, cursor=${sharedArgs.cursor ? "yes" : "no"})...`));
		const flatCurrent = await fetchFlat(
			db,
			getCursorPaginatedFullCusQuery(sharedArgs),
		);

		console.log(chalk.cyan(`Running OPTIMIZED query...`));
		const flatOptim = await fetchFlat(
			db,
			getOptimizedFullCusQuery(sharedArgs),
		);

		// Compare top-level array lengths
		const keys = [
			"customers",
			"customer_products",
			"customer_entitlements",
			"extra_customer_entitlements",
			"customer_prices",
			"entitlements",
			"rollovers",
			"replaceables",
			"free_trials",
			"subscriptions",
		] as const;

		console.log(chalk.bold("\nTop-level counts:"));
		let lenMismatch = false;
		for (const k of keys) {
			const a = (flatCurrent[k] as unknown[] | undefined)?.length ?? 0;
			const b = (flatOptim[k] as unknown[] | undefined)?.length ?? 0;
			const match = a === b;
			if (!match) lenMismatch = true;
			console.log(
				`  ${k.padEnd(32)} current=${String(a).padStart(5)}  optim=${String(b).padStart(5)}  ${match ? chalk.green("✓") : chalk.red("✗")}`,
			);
		}

		if (lenMismatch) {
			console.log(chalk.red("\n❌ Length mismatch — aborting deep compare"));
			process.exit(1);
		}

		// Reassemble both and deep compare the FullCustomer arrays
		const customersA = reassembleFlattenedCustomer(flatCurrent);
		const customersB = reassembleFlattenedCustomer(flatOptim);

		console.log(chalk.cyan(`\nReassembled ${customersA.length} customers (both queries)`));

		if (customersA.length !== customersB.length) {
			console.log(chalk.red(`Mismatch in reassembled customer counts: ${customersA.length} vs ${customersB.length}`));
			process.exit(1);
		}

		// Sort by id for stable diff (same cursor order should already be aligned)
		customersA.sort((a: any, b: any) => (a.internal_id ?? "").localeCompare(b.internal_id ?? ""));
		customersB.sort((a: any, b: any) => (a.internal_id ?? "").localeCompare(b.internal_id ?? ""));

		let diffs = 0;
		for (let i = 0; i < customersA.length; i++) {
			const a = sortDeep(customersA[i]);
			const b = sortDeep(customersB[i]);
			const ja = JSON.stringify(a);
			const jb = JSON.stringify(b);
			if (ja !== jb) {
				diffs++;
				if (diffs <= 3) {
					console.log(chalk.red(`\nDIFF for customer #${i} (${(customersA[i] as any).id}):`));
					// find first differing key
					for (const k of Object.keys(a as AnyRecord)) {
						const va = JSON.stringify((a as AnyRecord)[k]);
						const vb = JSON.stringify((b as AnyRecord)[k]);
						if (va !== vb) {
							console.log(`  KEY ${k}:`);
							console.log(chalk.gray(`    current: ${va?.slice(0, 200)}`));
							console.log(chalk.gray(`    optim:   ${vb?.slice(0, 200)}`));
						}
					}
				}
			}
		}

		if (diffs === 0) {
			console.log(chalk.green(`\n✅ All ${customersA.length} customers match byte-for-byte`));
		} else {
			console.log(chalk.red(`\n❌ ${diffs}/${customersA.length} customers differ`));
		}
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
