import { readdirSync } from "node:fs";
import { join } from "node:path";
import { SQL } from "bun";

const MIGRATIONS_DIR = "/tmp/drizzle-gen";
const db = new SQL(process.env.DATABASE_URL!);

// Apply all generated SQL files in order
const files = readdirSync(MIGRATIONS_DIR)
	.filter((f) => f.endsWith(".sql"))
	.sort();

for (const file of files) {
	const path = join(MIGRATIONS_DIR, file);
	console.log(`[sandbox] Applying ${file}...`);
	try {
		await db.file(path);
	} catch (err: any) {
		// 42P07 = relation already exists — schema already applied, safe to skip
		if (err?.errno === "42P07") {
			console.log(`[sandbox] Schema already exists, skipping`);
		} else {
			throw err;
		}
	}
}

await db.close();
console.log("[sandbox] Schema applied");
