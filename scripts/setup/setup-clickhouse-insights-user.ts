/**
 * Setup readonly user for ClickHouse insights queries
 * Usage: bun run scripts/setup-clickhouse-insights-user.ts
 * Or: infisical run --env=dev -- bun scripts/setup-clickhouse-insights-user.ts
 * Or: infisical run --env=prod -- bun scripts/setup-clickhouse-insights-user.ts
 */

import crypto from "node:crypto";
import { createClient } from "@clickhouse/client";

const ALLOWED_VIRTUAL_INSIGHTS_TABLES = ["org_events_view"] as const;

async function main() {
	const required = [
		"CLICKHOUSE_URL",
		"CLICKHOUSE_USERNAME",
		"CLICKHOUSE_PASSWORD",
		"CLICKHOUSE_INSIGHTS_USERNAME",
		"CLICKHOUSE_INSIGHTS_PASSWORD",
	];

	const missing = required.filter((key) => !process.env[key]);
	if (missing.length > 0) {
		console.error("Missing env vars:", missing.join(", "));
		process.exit(1);
	}

	const insightsUser = process.env.CLICKHOUSE_INSIGHTS_USERNAME!;
	const insightsPassword = process.env.CLICKHOUSE_INSIGHTS_PASSWORD!;

	const client = createClient({
		url: process.env.CLICKHOUSE_URL,
		username: process.env.CLICKHOUSE_USERNAME,
		password: process.env.CLICKHOUSE_PASSWORD,
	});

	try {
		// Check if user exists
		const result = await client.query({
			query: "SELECT name FROM system.users WHERE name = {username:String}",
			query_params: { username: insightsUser },
			format: "JSONEachRow",
		});

		const users = await result.json();

		if (users.length === 0) {
			// Create user
			const passwordHash = crypto
				.createHash("sha256")
				.update(insightsPassword)
				.digest("hex");

			await client.command({
				query: `CREATE USER ${insightsUser} IDENTIFIED WITH sha256_hash BY '${passwordHash}' SETTINGS readonly = 1`,
			});
			console.log(`✓ Created user: ${insightsUser}`);
		} else {
			console.log(`✓ User exists: ${insightsUser}`);
		}

		// Grant SELECT on virtual tables only
		// Note: Views with SQL SECURITY DEFINER execute with creator's privileges,
		// so insights_query_user does NOT need access to underlying tables
		for (const table of ALLOWED_VIRTUAL_INSIGHTS_TABLES) {
			await client.command({
				query: `GRANT SELECT ON ${table} TO ${insightsUser}`,
			});
			console.log(`✓ Granted SELECT on ${table}`);
		}

		console.log("\n✅ Setup complete");
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	} finally {
		await client.close();
	}
}

main();
