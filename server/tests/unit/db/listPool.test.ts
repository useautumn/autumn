import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getPostgresPools } from "@autumn/postgres";
import {
	type FakePostgresServer,
	startFakePostgresServer,
} from "@autumn/postgres/testing";
import { sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle.js";

/** The list row with a short clock, so the test proves the mechanism without waiting 10 s. */
const QUERY_TIMEOUT_MS = 500;

describe("the list pool under a read that never finishes", () => {
	let server: FakePostgresServer;
	let listPool: ReturnType<typeof initDrizzle>;

	beforeEach(async () => {
		server = await startFakePostgresServer();
		listPool = initDrizzle({
			pool: { ...getPostgresPools().list, queryTimeoutMs: QUERY_TIMEOUT_MS },
			databaseUrl: server.url,
		});
	});

	afterEach(async () => {
		await listPool.client.end();
		await server.close();
	});

	test("a plain read rejects at the query clock and its connection leaves the pool", async () => {
		await listPool.db.execute(sql`select 1`);
		server.silenceOpenConnections();

		const startedAt = performance.now();
		await expect(listPool.db.execute(sql`select 1`)).rejects.toThrow(
			"Query read timeout",
		);
		expect(performance.now() - startedAt).toBeLessThan(QUERY_TIMEOUT_MS + 500);
		expect(listPool.client.totalCount).toBe(0);

		await expect(listPool.db.execute(sql`select 1`)).resolves.toBeDefined();
		expect(server.connections()).toBe(2);
	});

	test("a read inside a transaction leaves the pool too, after its rollback waits one more clock", async () => {
		await listPool.db.execute(sql`select 1`);
		server.silenceOpenConnections();

		const startedAt = performance.now();
		await expect(
			listPool.db.transaction((tx) => tx.execute(sql`select 1`)),
		).rejects.toThrow("Query read timeout");
		expect(performance.now() - startedAt).toBeLessThan(
			2 * QUERY_TIMEOUT_MS + 500,
		);
		expect(listPool.client.totalCount).toBe(0);

		await expect(listPool.db.execute(sql`select 1`)).resolves.toBeDefined();
		expect(server.connections()).toBe(2);
	});
});
