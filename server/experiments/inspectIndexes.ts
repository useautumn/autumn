import chalk from "chalk";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		const tables = [
			"customers",
			"customer_products",
			"customer_entitlements",
			"customer_prices",
			"subscriptions",
		];
		for (const t of tables) {
			console.log(chalk.bold(`\n=== ${t} indexes ===`));
			const r = (await db.execute(sql.raw(`
				SELECT indexname, indexdef
				FROM pg_indexes
				WHERE tablename = '${t}' AND schemaname = 'public'
				ORDER BY indexname
			`))) as unknown as { indexname: string; indexdef: string }[];
			for (const idx of r) {
				console.log(`  ${idx.indexname}`);
				console.log(`    ${idx.indexdef}`);
			}
		}

		// Get total rows in customer_products across all orgs
		console.log(chalk.bold("\n=== Global customer_products stats ==="));
		const stats = (await db.execute(sql.raw(`
			SELECT
				reltuples::bigint AS estimated_rows,
				pg_size_pretty(pg_relation_size('customer_products')) AS table_size,
				pg_size_pretty(pg_indexes_size('customer_products')) AS indexes_size
			FROM pg_class WHERE relname = 'customer_products'
		`))) as unknown as { estimated_rows: string; table_size: string; indexes_size: string }[];
		console.log(`  estimated_rows=${stats[0].estimated_rows}  table=${stats[0].table_size}  indexes=${stats[0].indexes_size}`);

		// Actual count globally
		const real = (await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM customer_products`))) as unknown as { n: number }[];
		console.log(`  actual_total_rows=${real[0].n.toLocaleString()}`);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
