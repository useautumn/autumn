import chalk from "chalk";
import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const ORG_ID = "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt";

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		const tables = [
			"customers",
			"customer_products",
			"customer_entitlements",
			"customer_prices",
			"subscriptions",
			"entitlements",
			"products",
			"rollovers",
			"replaceables",
			"free_trials",
		];

		console.log(chalk.bold(`\nRow counts for org=${ORG_ID}:\n`));
		for (const t of tables) {
			const hasOrg = ["customers", "subscriptions", "entitlements", "products", "features"];
			const col = hasOrg.includes(t)
				? `WHERE org_id = '${ORG_ID}'`
				: t === "customer_products" ||
					  t === "customer_entitlements" ||
					  t === "customer_prices"
					? `WHERE internal_customer_id IN (SELECT internal_id FROM customers WHERE org_id = '${ORG_ID}')`
					: "";
			const start = performance.now();
			const r = (await db.execute(
				sql.raw(`SELECT COUNT(*)::int AS n FROM ${t} ${col}`),
			)) as unknown as { n: number }[];
			const n = r[0]?.n ?? 0;
			console.log(
				`  ${t.padEnd(28)} ${n.toLocaleString().padStart(10)}  (${(performance.now() - start).toFixed(0)}ms)`,
			);
		}

		// Sample a customer to see if it has any products
		const sample = (await db.execute(sql.raw(`
			SELECT c.internal_id, c.id,
				(SELECT COUNT(*)::int FROM customer_products cp WHERE cp.internal_customer_id = c.internal_id) AS cp_count,
				(SELECT COUNT(*)::int FROM customer_entitlements ce WHERE ce.internal_customer_id = c.internal_id) AS ce_count
			FROM customers c
			WHERE c.org_id = '${ORG_ID}'
			ORDER BY c.created_at DESC
			LIMIT 10
		`))) as unknown as Record<string, unknown>[];
		console.log(chalk.bold(`\nFirst 10 customers by created_at DESC:\n`));
		for (const row of sample) {
			console.log(
				`  ${(row.id as string).padEnd(30)} cp=${row.cp_count} ce=${row.ce_count}`,
			);
		}

		// Histogram: how many customers have N products?
		const hist = (await db.execute(sql.raw(`
			SELECT cp_bucket, COUNT(*)::int AS customer_count FROM (
				SELECT c.internal_id,
					LEAST(
						(SELECT COUNT(*)::int FROM customer_products cp WHERE cp.internal_customer_id = c.internal_id),
						10
					) AS cp_bucket
				FROM customers c
				WHERE c.org_id = '${ORG_ID}'
			) t
			GROUP BY cp_bucket
			ORDER BY cp_bucket
		`))) as unknown as { cp_bucket: number; customer_count: number }[];
		console.log(chalk.bold(`\nCustomer × #products histogram (capped at 10):\n`));
		for (const row of hist) {
			const bar = "█".repeat(Math.min(60, Math.floor(row.customer_count / 5000)));
			console.log(
				`  ${row.cp_bucket.toString().padStart(2)}: ${row.customer_count.toLocaleString().padStart(8)}  ${bar}`,
			);
		}
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
