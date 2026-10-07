import { describe, expect, test } from "bun:test";
import type { Socket } from "node:net";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
	getScopedAutocommitDb,
	withAutocommitDb,
} from "@/db/autocommit/withAutocommitDb.js";
import { isTransientDbError } from "@/db/dbUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { runWithTransientDbRetry } from "@/internal/migrations/v2/batchOperations/execute/utils/runWithTransientDbRetry.js";
import { applyMigrationQueryDeadline } from "@/trigger/migrations/database/applyMigrationQueryDeadline.js";
import {
	migrationTestDatabaseUrl,
	withScratchSchema,
} from "./utils/scratchDatabase.js";

const databaseUrl = migrationTestDatabaseUrl();

describe.skipIf(!databaseUrl)("migration pool deadline", () => {
	test("a rejected BEGIN keeps its error and returns its pool slot", async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			connectionTimeoutMillis: 200,
		});
		applyMigrationQueryDeadline({ pool, queryTimeoutMs: 1000 });
		try {
			const error = await drizzle(pool)
				.transaction(async () => {}, {
					isolationLevel: "invalid" as "serializable",
				})
				.catch((error: unknown) => error);
			expect(String(error)).not.toContain("outcome unknown");
			expect(pool.totalCount).toBe(0);
			expect((await pool.query("select 1 as value")).rows).toEqual([
				{ value: 1 },
			]);
		} finally {
			await pool.end();
		}
	}, 5000);

	test("a lost BEGIN reply returns its pool slot despite Drizzle's pre-finally failure", async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			connectionTimeoutMillis: 200,
		});
		applyMigrationQueryDeadline({ pool, queryTimeoutMs: 100 });
		const client = await pool.connect();
		const socket = (client as unknown as { connection: { stream: Socket } })
			.connection.stream;
		client.release();
		socket.pause();
		try {
			await expect(
				drizzle(pool).transaction(async () => {
					throw new Error("must not execute");
				}),
			).rejects.toThrow();
			expect(pool.totalCount).toBe(0);
			expect((await pool.query("select 1 as value")).rows).toEqual([
				{ value: 1 },
			]);
		} finally {
			if (pool.totalCount && !pool.idleCount) client.release(true);
			await pool.end();
		}
	}, 5000);
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

	test("an unknown COMMIT is not replayed or masked by Drizzle rollback", async () => {
		await withScratchSchema({
			databaseUrl: databaseUrl!,
			run: async ({ options }) => {
				const pool = new pg.Pool({
					connectionString: databaseUrl,
					options,
					max: 1,
				});
				applyMigrationQueryDeadline({ pool, queryTimeoutMs: 100 });
				await pool.query("create table commits (value integer)");
				let socket: Socket;
				pool.on("acquire", (client) => {
					socket = (client as unknown as { connection: { stream: Socket } })
						.connection.stream;
				});
				let attempts = 0;
				try {
					const error = await runWithTransientDbRetry({
						maxAttempts: 3,
						delayMs: 0,
						run: () =>
							drizzle(pool).transaction(async (transaction) => {
								attempts++;
								await transaction.execute(sql`insert into commits values (1)`);
								socket.pause();
							}),
					}).catch((error: unknown) => error);
					expect(error).toBeInstanceOf(Error);
					expect(isTransientDbError({ error })).toBe(false);
					expect(attempts).toBe(1);
					expect((await pool.query("select * from commits")).rows).toEqual([
						{ value: 1 },
					]);
				} finally {
					await pool.end();
				}
			},
		});
	}, 5000);

	test("standalone claim uncertainty and a stalled terminal write both settle without replay", async () => {
		await withScratchSchema({
			databaseUrl: databaseUrl!,
			run: async ({ options }) => {
				const pool = new pg.Pool({
					connectionString: databaseUrl,
					options,
					max: 1,
				});
				applyMigrationQueryDeadline({ pool, queryTimeoutMs: 100 });
				await pool.query(
					"create table claims (id integer primary key, status text)",
				);
				const client = await pool.connect();
				const socket = (client as unknown as { connection: { stream: Socket } })
					.connection.stream;
				client.release();
				let attempts = 0;
				try {
					socket.pause();
					await expect(
						runWithTransientDbRetry({
							maxAttempts: 3,
							delayMs: 0,
							run: () => {
								attempts++;
								return pool.query(
									"insert into claims values (1, 'running') returning id",
								);
							},
						}),
					).rejects.toThrow("outcome unknown");
					expect(attempts).toBe(1);
					expect(socket.destroyed).toBe(true);
					expect((await pool.query("select * from claims")).rows).toEqual([
						{ id: 1, status: "running" },
					]);
					const terminal = await pool.connect();
					const terminalSocket = (
						terminal as unknown as { connection: { stream: Socket } }
					).connection.stream;
					terminal.release();
					terminalSocket.pause();
					await expect(
						pool.query("update claims set status = 'failed' where id = 1"),
					).rejects.toThrow("outcome unknown");
					expect(terminalSocket.destroyed).toBe(true);
				} finally {
					await pool.end();
				}
			},
		});
	}, 5000);

	test("queued statements have separate dispatch deadlines", async () => {
		const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
		applyMigrationQueryDeadline({ pool, queryTimeoutMs: 150 });
		const client = await pool.connect();
		try {
			await Promise.all(
				[1, 2, 3].map(() => client.query("select pg_sleep(0.08)")),
			);
		} finally {
			client.release();
			await pool.end();
		}
	}, 5000);

	test("an acquisition timeout cannot execute a queued write when a client arrives late", async () => {
		const pool = new pg.Pool({
			connectionString: databaseUrl,
			max: 1,
			connectionTimeoutMillis: 100,
		});
		applyMigrationQueryDeadline({ pool, queryTimeoutMs: 100 });
		const held = await pool.connect();
		try {
			await expect(pool.query("select 1")).rejects.toThrow(
				"timeout exceeded when trying to connect",
			);
			expect(pool.waitingCount).toBe(0);
		} finally {
			held.release();
			await pool.end();
		}
	}, 5000);

	test("100 transactions finish nested autocommit work within the unchanged 110 connection budget", async () => {
		const { markCustomerUpdatedAt } = await import(
			"@/internal/customers/customerLsns/markCustomerUpdatedAt.js"
		);
		await withScratchSchema({
			databaseUrl: databaseUrl!,
			run: async ({ options }) => {
				const pool = new pg.Pool({
					connectionString: databaseUrl,
					options,
					max: 110,
					connectionTimeoutMillis: 2000,
				});
				applyMigrationQueryDeadline({ pool, queryTimeoutMs: 2000 });
				await pool.query(
					"create table customer_lsns (org_id text, env text, customer_id text, internal_customer_id text, updated_at timestamptz default now(), primary key (org_id, env, customer_id))",
				);
				const db = drizzle(pool) as unknown as DrizzleCli;
				let ready = 0;
				let release: () => void = () => {};
				const barrier = new Promise<void>((resolve) => {
					release = resolve;
				});
				let peak = 0;
				pool.on("connect", () => {
					peak = Math.max(peak, pool.totalCount);
				});
				try {
					await withAutocommitDb({
						db,
						run: () =>
							Promise.all(
								Array.from({ length: 100 }, (_, index) =>
									drizzle(pool).transaction(async (transaction) => {
										await transaction.execute(sql`select 1`);
										if (++ready === 100) release();
										await barrier;
										await markCustomerUpdatedAt({
											db: transaction as unknown as DrizzleCli,
											orgId: "org_test",
											env: "sandbox",
											customerId: `customer_${index}`,
										});
									}),
								),
							),
					});
					expect(ready).toBe(100);
					expect(peak).toBeGreaterThan(100);
					expect(peak).toBeLessThanOrEqual(110);
					expect(pool.waitingCount).toBe(0);
					expect(
						(
							await pool.query(
								"select count(*)::integer as count from customer_lsns",
							)
						).rows,
					).toEqual([{ count: 100 }]);
					expect(getScopedAutocommitDb()).toBeUndefined();
				} finally {
					await pool.end();
				}
			},
		});
	}, 10000);

	test("a missing freshness-mark reply retries only its autocommit write and survives outer rollback", async () => {
		const { markCustomerUpdatedAt } = await import(
			"@/internal/customers/customerLsns/markCustomerUpdatedAt.js"
		);
		await withScratchSchema({
			databaseUrl: databaseUrl!,
			run: async ({ options }) => {
				const pool = new pg.Pool({
					connectionString: databaseUrl,
					options,
					max: 2,
				});
				const failures: Record<string, unknown>[] = [];
				applyMigrationQueryDeadline({
					pool,
					queryTimeoutMs: 100,
					onFailure: (fields) => failures.push(fields),
				});
				await pool.query(
					"create table customer_lsns (org_id text, env text, customer_id text, internal_customer_id text, updated_at timestamptz default now(), primary key (org_id, env, customer_id))",
				);
				const db = drizzle(pool) as unknown as DrizzleCli;
				let pauseMark = false;
				pool.on("acquire", (client) => {
					if (!pauseMark) return;
					pauseMark = false;
					(
						client as unknown as { connection: { stream: Socket } }
					).connection.stream.pause();
				});
				try {
					await expect(
						withAutocommitDb({
							db,
							run: () =>
								drizzle(pool).transaction(async (transaction) => {
									pauseMark = true;
									await markCustomerUpdatedAt({
										db: transaction as unknown as DrizzleCli,
										orgId: "org_test",
										env: "sandbox",
										customerId: "customer_1",
									});
									throw new Error("intentional outer rollback");
								}),
						}),
					).rejects.toThrow("intentional outer rollback");
					expect(failures).toHaveLength(1);
					expect(failures[0]).toMatchObject({
						pool: "migration",
						phase: "query",
						command: "INSERT",
						reason: "deadline",
					});
					expect(
						(await pool.query("select customer_id from customer_lsns")).rows,
					).toEqual([{ customer_id: "customer_1" }]);
					expect(getScopedAutocommitDb()).toBeUndefined();
				} finally {
					await pool.end();
				}
			},
		});
	}, 10000);
});
