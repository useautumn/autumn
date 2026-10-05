import { describe, expect, test } from "bun:test";
import { sqlOptionsOf } from "@autumn/postgres";
import { workerPostgresClientConfig } from "../../../src/external/postgres/getWorkerDb.js";

describe("worker Postgres client", () => {
	test("the pool never ends a busy connection by age", () => {
		const config = workerPostgresClientConfig({
			env: {
				DATABASE_URL: "postgres://user:secret@127.0.0.1:1/never",
				BALANCE_WORKER_DATABASE_POOL_SIZE: 32,
			},
		});

		expect(sqlOptionsOf({ config })).toMatchObject({
			max: 32,
			maxLifetime: 0,
			idleTimeout: 5,
		});
	});

	test("a silent connection fails a query within seconds, above the flush statement_timeout", () => {
		const config = workerPostgresClientConfig({
			env: {
				DATABASE_URL: "postgres://user:secret@127.0.0.1:1/never",
				BALANCE_WORKER_DATABASE_POOL_SIZE: 32,
			},
		});

		expect(config.idleTimeout).toBeGreaterThan(2);
		expect(config.idleTimeout).toBeLessThanOrEqual(5);
	});
});
