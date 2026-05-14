import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const main = async () => {
	const { db, client } = initDrizzle();
	try {
		const rows = (await db.execute(sql`
			SELECT indexname, indexdef
			FROM pg_indexes
			WHERE schemaname = 'public'
				AND tablename = 'customer_products'
				AND (indexname LIKE '%revenuecat%' OR indexdef LIKE '%revenuecat%')
		`)) as any[];
		console.log(JSON.stringify(rows, null, 2));
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
