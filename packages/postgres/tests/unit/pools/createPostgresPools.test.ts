import { describe, expect, test } from "bun:test";
import { createPostgresPools } from "../../../src/pools/createPostgresPools.js";

const production = createPostgresPools({
	runtimeEnv: { NODE_ENV: "production" },
});
const development = createPostgresPools({ runtimeEnv: {} });

describe("createPostgresPools", () => {
	test("production runs the strict clocks and fleet-budgeted sizes", () => {
		expect(production.critical).toEqual({
			applicationName: "autumn-critical",
			maxConnections: 22,
			minConnections: 10,
			connectTimeoutMs: 15_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 15_000,
			statementTimeoutMs: 2_000,
		});
		expect(production.general).toMatchObject({
			applicationName: null,
			maxConnections: 14,
			minConnections: 1,
			connectTimeoutMs: 5_000,
			queryTimeoutMs: null,
		});
		expect(production.replica).toMatchObject({
			applicationName: "autumn-replica",
			maxConnections: 9,
			minConnections: 4,
			connectTimeoutMs: 3_000,
			queryTimeoutMs: 5_000,
		});
		expect(production.replicaSlow).toMatchObject({
			applicationName: "autumn-replica-slow",
			maxConnections: 2,
			connectTimeoutMs: 5_000,
			queryTimeoutMs: 60_000,
		});
		expect(production.adHoc.maxConnections).toBe(70);
	});

	test("outside production the request-path pools relax so local warm-up never fails a test", () => {
		expect(development.critical).toMatchObject({
			maxConnections: 10,
			minConnections: 10,
			connectTimeoutMs: 30_000,
			queryTimeoutMs: 30_000,
		});
		expect(development.general).toMatchObject({
			maxConnections: 10,
			connectTimeoutMs: 30_000,
		});
		expect(development.adHoc.maxConnections).toBe(10);
	});

	test("the other processes' pools don't vary by environment", () => {
		for (const name of [
			"replica",
			"replicaSlow",
			"neonEvents",
			"worker",
			"cron",
			"dbProbe",
			"resetCron",
			"migration",
			"replay",
			"balanceWorker",
			"herald",
			"heraldEvents",
		] as const) {
			expect(development[name]).toEqual(production[name]);
		}
		expect(production.neonEvents).toMatchObject({
			applicationName: "autumn-neon-events",
			maxConnections: 5,
			connectTimeoutMs: 10_000,
			queryTimeoutMs: 10_000,
		});
		expect(production.worker).toMatchObject({
			maxConnections: 40,
			connectTimeoutMs: 5_000,
			queryTimeoutMs: null,
		});
		expect(production.cron).toMatchObject({
			maxConnections: 40,
			statementTimeoutMs: 300_000,
		});
		expect(production.dbProbe).toMatchObject({
			maxConnections: 2,
			connectTimeoutMs: 5_000,
		});
		expect(production.resetCron).toMatchObject({ maxConnections: 10 });
		expect(production.migration).toMatchObject({
			maxConnections: 100,
			queryTimeoutMs: null,
		});
		expect(production.replay).toMatchObject({
			maxConnections: 4,
			connectTimeoutMs: 2_000,
			queryTimeoutMs: 2_000,
		});
		expect(production.balanceWorker).toMatchObject({
			applicationName: "autumn-balance-worker",
			maxConnections: 32,
			connectTimeoutMs: 10_000,
			queryTimeoutMs: 5_000,
			statementTimeoutMs: 2_000,
		});
		expect(production.herald).toMatchObject({
			applicationName: "autumn-herald",
			maxConnections: 2,
			connectTimeoutMs: 10_000,
			queryTimeoutMs: 30_000,
		});
		expect(production.heraldEvents).toEqual({
			applicationName: "autumn-herald-events",
			maxConnections: 4,
			minConnections: 0,
			connectTimeoutMs: 10_000,
			idleTimeoutMs: 30_000,
			queryTimeoutMs: 30_000,
			statementTimeoutMs: null,
		});
	});

	test("every pool reaps idle connections after 30 s", () => {
		for (const pool of Object.values(production)) {
			expect(pool.idleTimeoutMs).toBe(30_000);
		}
	});

	test("*_DB_POOL_MAX overrides a pool's size, and the warm floor follows it down", () => {
		const pools = createPostgresPools({
			runtimeEnv: {
				NODE_ENV: "production",
				CRITICAL_DB_POOL_MAX: "6",
				GENERAL_DB_POOL_MAX: "3",
				REPLICA_DB_POOL_MAX: "2",
				REPLICA_SLOW_DB_POOL_MAX: "1",
				MIGRATION_DB_POOL_MAX: "12",
			},
		});
		expect(pools.critical).toMatchObject({
			maxConnections: 6,
			minConnections: 6,
		});
		expect(pools.general.maxConnections).toBe(3);
		expect(pools.replica).toMatchObject({
			maxConnections: 2,
			minConnections: 2,
		});
		expect(pools.replicaSlow.maxConnections).toBe(1);
		expect(pools.migration.maxConnections).toBe(12);
	});

	test("a malformed override falls back to the default", () => {
		const pools = createPostgresPools({
			runtimeEnv: {
				NODE_ENV: "production",
				CRITICAL_DB_POOL_MAX: "lots",
				GENERAL_DB_POOL_MAX: "0",
			},
		});
		expect(pools.critical.maxConnections).toBe(22);
		expect(pools.general.maxConnections).toBe(14);
	});

	test("the migration pool holds two connections per in-flight customer", () => {
		expect(
			createPostgresPools({
				runtimeEnv: { MIGRATION_RUN_CUSTOMER_CONCURRENCY: "80" },
			}).migration.maxConnections,
		).toBe(160);
	});
});
