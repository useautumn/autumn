import { sql } from "drizzle-orm";
import { initDrizzle } from "./experimentEnv";

// Run with `bun run experiments/checkIndexes.ts`

const main = async () => {
	const { db } = initDrizzle();

	console.log("=== INDEX VALIDITY CHECK ===\n");

	const results = await db.execute(sql`
		SELECT c.relname, i.indisvalid, i.indisready, i.indislive,
		       pg_size_pretty(pg_relation_size(c.oid)) as size,
		       am.amname as type
		FROM pg_index i
		JOIN pg_class c ON c.oid = i.indexrelid
		JOIN pg_am am ON am.oid = c.relam
		WHERE c.relname IN (
			'idx_referral_codes_internal_customer_id',
			'idx_referral_codes_internal_customer_id_v2',
			'idx_reward_redemptions_referral_code_id',
			'idx_reward_redemptions_referral_code_id_v2',
			'idx_customers_processor_gin',
			'idx_customers_processor_gin_v2',
			'idx_customers_processor_id',
			'idx_customers_processor_id_v2'
		)
		ORDER BY c.relname
	`);

	if (results.length === 0) {
		console.log("No matching indexes found.\n");
	}

	for (const row of results) {
		const r = row as Record<string, unknown>;
		const valid = r.indisvalid ? "VALID" : "INVALID";
		console.log(
			`${valid} | ${r.relname} | type: ${r.type} | size: ${r.size}`,
		);
	}

	process.exit(0);
};

await main();
