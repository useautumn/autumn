/**
 * Recreate ClickHouse date range views
 * Creates both legacy views (for AnalyticsService) and new event aggregation views (for EventsAggregationService)
 * Usage: bun run scripts/setup/events/recreate-clickhouse-event-views.ts
 * Or: infisical run --env=dev -- bun scripts/setup/events/recreate-clickhouse-event-views.ts
 * Or: infisical run --env=prod -- bun scripts/setup/events/recreate-clickhouse-event-views.ts
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@clickhouse/client";

async function main() {
	const required = [
		"CLICKHOUSE_URL",
		"CLICKHOUSE_USERNAME",
		"CLICKHOUSE_PASSWORD",
	];

	const missing = required.filter((key) => !process.env[key]);
	if (missing.length > 0) {
		console.error("Missing env vars:", missing.join(", "));
		process.exit(1);
	}

	const client = createClient({
		url: process.env.CLICKHOUSE_URL,
		username: process.env.CLICKHOUSE_USERNAME,
		password: process.env.CLICKHOUSE_PASSWORD,
	});

	try {
		const queriesDir = path.join(
			import.meta.dir,
			"../../server/src/external/clickhouse/queries",
		);

		const viewsToRecreate = [
			"CREATE_DATE_RANGE_VIEW.sql",
			"CREATE_DATE_RANGE_BC_VIEW.sql",
			"CREATE_EVENT_AGGREGATION_DATE_RANGE_VIEW.sql",
			"CREATE_EVENT_AGGREGATION_DATE_RANGE_BC_VIEW.sql",
		];

		console.log("🔄 Recreating ClickHouse views...\n");

		for (const sqlFile of viewsToRecreate) {
			const filePath = path.join(queriesDir, sqlFile);
			const sql = fs.readFileSync(filePath, "utf8");

			console.log(`📝 Executing: ${sqlFile}`);
			await client.query({ query: sql });
			console.log(`✅ Success: ${sqlFile}\n`);
		}

		console.log("✅ All views recreated successfully!");
		console.log("\n🎯 The bin count issue should now be fixed.");
		console.log("   Test with your curl command to verify.");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	} finally {
		await client.close();
	}
}

main();
