import { describe, expect, test } from "bun:test";
import type { Socket } from "node:net";
import pg from "pg";
import { applyMigrationQueryDeadline } from "@/trigger/migrations/database/applyMigrationQueryDeadline.js";
import { migrationTestDatabaseUrl } from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl();

describe.skipIf(!databaseUrl)("migration pool deadline", () => {
	test("a missing reply retires the client before rejecting and never reuses it", async () => {
		const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
		applyMigrationQueryDeadline({ pool, queryTimeoutMs: 100 });
		const client = await pool.connect();
		const socket = (client as unknown as { connection: { stream: Socket } })
			.connection.stream;
		const first = await client.query("select pg_backend_pid() as id");
		socket.pause();
		const watchdog = setTimeout(() => socket.resume(), 800);
		try {
			const outcome = await client.query("select 1").then(
				() => "resolved",
				(error: Error) => error.message,
			);
			expect(outcome).toContain("outcome unknown");
			expect(socket.destroyed).toBe(true);
			await expect(client.query("rollback")).rejects.toThrow("outcome unknown");
			client.release();
			const next = await pool.query("select pg_backend_pid() as id");
			expect(next.rows[0].id).not.toBe(first.rows[0].id);
		} finally {
			clearTimeout(watchdog);
			socket.resume();
			if (!socket.destroyed) client.release(true);
			await pool.end();
		}
	}, 5000);
});
