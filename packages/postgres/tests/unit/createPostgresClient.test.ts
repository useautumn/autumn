import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { isPostgresConnectionFailure } from "../../src/common/postgresErrors.js";
import { runInTransaction } from "../../src/common/runInTransaction.js";
import { createPostgresClient } from "../../src/createPostgresClient.js";
import type { PostgresClient } from "../../src/types/postgresClient.js";
import {
	type FakePostgresServer,
	startFakePostgresServer,
} from "../fixtures/fakePostgresServer.js";

const QUERY_TIMEOUT_SECONDS = 1;
const logger = { warn: () => {} };

const elapsedMs = async (run: () => Promise<unknown>) => {
	const startedAt = performance.now();
	await run().catch(() => {});
	return performance.now() - startedAt;
};

describe("createPostgresClient", () => {
	let server: FakePostgresServer;
	let postgres: PostgresClient;

	beforeEach(async () => {
		server = await startFakePostgresServer();
		postgres = createPostgresClient({
			ctx: { logger },
			config: {
				databaseUrl: server.url,
				applicationName: "postgres-test",
				maxConnections: 1,
				connectTimeout: 1,
				idleTimeout: 30,
				queryTimeout: QUERY_TIMEOUT_SECONDS,
			},
		});
	});

	/** Drizzle's query is a thenable, not a promise; `expect().rejects` wants the promise. */
	const selectOne = () => Promise.resolve(postgres.db.execute(sql`select 1`));

	afterEach(async () => {
		await postgres.close();
		await server.close();
	});

	test("opens lazily and closes without ever connecting", () => {
		expect(postgres.db.query.customerEntitlements).toBeDefined();
		expect(server.connections()).toBe(0);
	});

	test("a query on a silent connection fails at the query timeout, not the idle timeout", async () => {
		await selectOne();
		server.silenceOpenConnections();

		const startedAt = performance.now();
		const error = await selectOne().catch((cause: unknown) => cause);

		expect(performance.now() - startedAt).toBeLessThan(
			QUERY_TIMEOUT_SECONDS * 1000 + 500,
		);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("Query read timeout");
		expect(isPostgresConnectionFailure({ error })).toBe(true);
	});

	test("a query that timed out leaves the pool, so the next query gets a live connection", async () => {
		await selectOne();
		server.silenceOpenConnections();
		await expect(selectOne()).rejects.toThrow();

		await expect(selectOne()).resolves.toBeDefined();
		expect(server.connections()).toBe(2);
	});

	test("a transaction that timed out leaves the pool, within two query timeouts (its rollback waits one)", async () => {
		const failedAfterMs = await elapsedMs(() =>
			runInTransaction({
				ctx: { db: postgres.db },
				run: async (tx) => {
					server.silenceOpenConnections();
					await tx.execute(sql`select 1`);
				},
			}),
		);
		expect(failedAfterMs).toBeLessThan(2 * QUERY_TIMEOUT_SECONDS * 1000 + 500);

		await expect(selectOne()).resolves.toBeDefined();
		expect(server.connections()).toBe(2);
	});

	test("a transaction that fails in Postgres keeps its connection", async () => {
		await expect(
			runInTransaction({
				ctx: { db: postgres.db },
				run: async () => {
					throw Object.assign(new Error("duplicate key"), {
						code: "23505",
						severity: "ERROR",
					});
				},
			}),
		).rejects.toThrow("duplicate key");

		await selectOne();
		expect(server.connections()).toBe(1);
	});
});
