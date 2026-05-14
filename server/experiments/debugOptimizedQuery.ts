import { AppEnv } from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { RELEVANT_STATUSES } from "../src/internal/customers/cusProducts/CusProductService";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";
import { getOptimizedFullCusQuery } from "./optimizedFullCusQuery";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		const query = getOptimizedFullCusQuery({
			orgId: ORG_ID,
			env: AppEnv.Sandbox,
			inStatuses: RELEVANT_STATUSES,
			withSubs: false,
			limit: 1000,
			cusProductLimit: 15,
		});

		console.log(chalk.cyan("Running optimized first page..."));
		try {
			const r = await db.execute(query);
			console.log(chalk.green(`OK: ${(r as any).length} row(s)`));
			const first = (r as any)[0];
			if (first) {
				for (const [k, v] of Object.entries(first)) {
					const arr = Array.isArray(v) ? v : v != null && typeof v === "object" && "length" in (v as any) ? (v as any[]) : null;
					console.log(`  ${k}: ${arr ? `${arr.length} items` : typeof v}`);
				}
			}
		} catch (e: any) {
			console.error(chalk.red(`SQL ERROR: ${e.message}`));
			console.error(chalk.gray(`code: ${e.code}, where: ${e.where ?? "n/a"}, detail: ${e.detail ?? "n/a"}, hint: ${e.hint ?? "n/a"}`));
			if (e.position) console.error(chalk.gray(`position: ${e.position}`));
		}
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
