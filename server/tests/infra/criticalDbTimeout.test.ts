import { expect, test } from "bun:test";
import net from "node:net";
import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import {
	clientCritical,
	clientGeneral,
	dbGeneral,
	initDrizzle,
} from "@/db/initDrizzle.js";

assertNotProductionDb();

test("critical DB pool has a client query timeout while general pool does not", () => {
	const isProd = process.env.NODE_ENV === "production";

	expect(clientCritical.options.query_timeout).toBe(isProd ? 15_000 : 30_000);
	expect(clientGeneral.options.query_timeout).toBeUndefined();
});

test("pool query timeout rejects slow queries and leaves the pool usable", async () => {
	const { db: timedDb, client: timedClient } = initDrizzle({
		poolConfig: { query_timeout: 2_000 },
	});

	try {
		const startedAt = Date.now();
		await expect(timedDb.execute(sql`SELECT pg_sleep(3)`)).rejects.toThrow(
			/Query read timeout/i,
		);
		const durationMs = Date.now() - startedAt;

		expect(durationMs).toBeGreaterThanOrEqual(1_750);
		expect(durationMs).toBeLessThan(2_750);

		const result = await timedClient.query<{ ok: number }>("SELECT 1 AS ok");
		expect(result.rows[0]?.ok).toBe(1);
	} finally {
		await timedClient.end().catch(() => {});
	}

	const generalStartedAt = Date.now();
	await dbGeneral.execute(sql`SELECT pg_sleep(3)`);
	expect(Date.now() - generalStartedAt).toBeGreaterThanOrEqual(2_750);
});

test("db connect timeout fails fast when postgres accepts tcp but never responds", async () => {
	// Bun 1.4 never surfaces the peer close on the accepted socket, so
	// server.close() would wait forever unless we destroy it ourselves.
	const sockets = new Set<net.Socket>();
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Failed to bind test TCP server");
	}

	const databaseUrl = process.env.DATABASE_URL;
	process.env.DATABASE_URL = `postgres://user:password@127.0.0.1:${address.port}/db`;

	const { client: deadClient } = initDrizzle({ connectTimeout: 1 });
	const startedAt = Date.now();

	try {
		await expect(deadClient.query("SELECT 1")).rejects.toThrow(/timeout/i);

		expect(Date.now() - startedAt).toBeLessThan(2_000);
	} finally {
		process.env.DATABASE_URL = databaseUrl;
		await deadClient.end().catch(() => {});
		for (const socket of sockets) socket.destroy();
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
});
