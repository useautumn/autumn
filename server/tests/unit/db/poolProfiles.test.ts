import { describe, expect, test } from "bun:test";
import { getPostgresPools, poolConfigOf } from "@autumn/postgres";
import { clientCritical, clientGeneral } from "@/db/initDrizzle.js";

describe("server pools come from the @autumn/postgres pool table", () => {
	test("critical and general pools carry their rows' clocks, plus the server's TCP keepalive", () => {
		const pools = getPostgresPools();
		expect(clientCritical.options).toMatchObject({
			application_name: "autumn-critical",
			max: pools.critical.maxConnections,
			min: pools.critical.minConnections,
			connectionTimeoutMillis: pools.critical.connectTimeoutMs,
			idleTimeoutMillis: 30_000,
			query_timeout: pools.critical.queryTimeoutMs,
			keepAlive: true,
			keepAliveInitialDelayMillis: 60_000,
		});
		expect(clientGeneral.options).toMatchObject({
			max: pools.general.maxConnections,
			min: 1,
			connectionTimeoutMillis: pools.general.connectTimeoutMs,
			idleTimeoutMillis: 30_000,
			keepAlive: true,
		});
		expect(clientGeneral.options.application_name).toBeUndefined();
		expect(clientGeneral.options.query_timeout).toBeUndefined();
	});

	test("an unbounded row sets no pg query_timeout, so pg's own default (none) applies", () => {
		expect(
			poolConfigOf({
				config: { databaseUrl: "postgres://x", ...getPostgresPools().general },
			}).query_timeout,
		).toBeUndefined();
	});
});
