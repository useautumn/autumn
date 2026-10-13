import { describe, expect, test } from "bun:test";
import { poolConfigOf } from "@autumn/postgres";
import { workerPostgresClientConfig } from "../../../src/external/postgres/getWorkerDb.js";

describe("worker Postgres client", () => {
	test("a query on a silent connection fails at the 5s read deadline, well inside the 30s idle reap", () => {
		const config = workerPostgresClientConfig({
			env: { DATABASE_URL: "postgres://user:secret@127.0.0.1:1/never" },
		});

		expect(poolConfigOf({ config })).toMatchObject({
			application_name: "autumn-balance-worker",
			max: 32,
			query_timeout: 5_000,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 10_000,
		});
	});
});
