import { createHash } from "node:crypto";
import type pg from "pg";
import type { PendingMigration } from "./pendingMigrations.ts";

/**
 * Per-statement, transactionless migration runner for fresh-DB bootstraps
 * (currently only `bun dw setup`). drizzle-kit's regular `migrate` wraps the
 * entire pending batch in one transaction, which makes `CREATE INDEX
 * CONCURRENTLY` impossible. We split on the same `--> statement-breakpoint`
 * marker and execute each statement on its own connection — no BEGIN/COMMIT.
 *
 * Hash + applied-tracking match drizzle-kit byte-for-byte (sha256 of raw .sql
 * contents, inserted into `drizzle.__drizzle_migrations`) so a later
 * `drizzle-kit migrate` against the same DB sees them as already applied.
 */
export async function runBootstrapMigrate(
	client: pg.Client,
	pending: PendingMigration[],
): Promise<void> {
	for (const m of pending) {
		const hash = createHash("sha256").update(m.sql).digest("hex");
		const statements = m.sql.split("--> statement-breakpoint");
		for (const raw of statements) {
			const stmt = raw.trim();
			if (!stmt) continue;
			try {
				await client.query(stmt);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				throw new Error(
					`bootstrap migrate: failed in ${m.tag}.sql\n  statement: ${stmt.slice(0, 200)}${stmt.length > 200 ? "…" : ""}\n  error: ${msg}`,
				);
			}
		}
		await client.query(
			`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
			[hash, Date.now()],
		);
	}
}
