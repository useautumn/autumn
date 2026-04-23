import net from "node:net";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { assertNotProductionDb } from "@/db/dbUtils.js";
import {
	clientCritical,
	dbCritical,
	dbGeneral,
	initDrizzle,
} from "@/db/initDrizzle.js";

assertNotProductionDb();

test("critical DB pool times out slow queries while general pool does not", async () => {
	const criticalStartedAt = Date.now();
	await expect(dbCritical.execute(sql`SELECT pg_sleep(3)`)).rejects.toThrow(
		/Query read timeout/i,
	);
	const criticalDurationMs = Date.now() - criticalStartedAt;

	expect(criticalDurationMs).toBeGreaterThanOrEqual(1_750);
	expect(criticalDurationMs).toBeLessThan(2_750);

	const generalStartedAt = Date.now();
	await dbGeneral.execute(sql`SELECT pg_sleep(3)`);
	const generalDurationMs = Date.now() - generalStartedAt;

	expect(generalDurationMs).toBeGreaterThanOrEqual(2_750);
}, 10_000);

test("critical DB pool is usable after a query timeout", async () => {
	await expect(dbCritical.execute(sql`SELECT pg_sleep(3)`)).rejects.toThrow(
		/Query read timeout/i,
	);

	const result = await clientCritical.query<{ ok: number }>("SELECT 1 AS ok");

	expect(result.rows[0]?.ok).toBe(1);
}, 6_000);

test("db connect timeout fails fast when postgres accepts tcp but never responds", async () => {
	const server = net.createServer();
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
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}, 5_000);
