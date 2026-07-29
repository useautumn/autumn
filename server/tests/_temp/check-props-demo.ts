import { sql } from "drizzle-orm";
import { db } from "../../src/db/initDrizzle.js";

const result = await db.execute(
	sql`SELECT e.properties FROM events e
		JOIN customers c ON c.internal_id = e.internal_customer_id
		WHERE c.id = 'props-demo' LIMIT 5000`,
);
const rows = Array.isArray(result)
	? result
	: ((result as unknown as { rows?: unknown[] }).rows ?? []);
console.log(`events in PG: ${rows.length}`);
const keys = new Set<string>();
for (const row of rows) {
	const raw = (row as { properties: unknown }).properties;
	const properties = typeof raw === "string" ? JSON.parse(raw) : raw;
	for (const key of Object.keys(properties ?? {})) keys.add(key);
}
console.log(`distinct property keys: ${keys.size}`);
const apiKeyValues = new Set<string>();
for (const row of rows) {
	const raw = (row as { properties: unknown }).properties;
	const properties = typeof raw === "string" ? JSON.parse(raw) : raw;
	if (properties?.apiKeyId) apiKeyValues.add(String(properties.apiKeyId));
}
console.log(`distinct apiKeyId values: ${apiKeyValues.size}`);
process.exit(0);
