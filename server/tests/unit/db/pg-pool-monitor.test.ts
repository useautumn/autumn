/**
 * Active Postgres connection drops must stay inside the pool instead of killing the process.
 * Red: acquired errors are unhandled. Green: they are logged until release.
 */

import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";

const warn = mock((..._args: unknown[]) => {});
mock.module("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info: mock(() => {}),
		warn,
		error: mock(() => {}),
		debug: mock(() => {}),
		child: () => ({}),
	},
}));

const { attachPoolErrorHandlers } = await import("@/db/pgPoolMonitor.js");

const createPool = () => new EventEmitter() as unknown as Pool;
const createClient = () => new EventEmitter() as unknown as PoolClient;

describe("attachPoolErrorHandlers", () => {
	test("handles an acquired client connection drop without an uncaught error", () => {
		const pool = createPool();
		const client = createClient();
		attachPoolErrorHandlers({ pool, name: "general" });

		pool.emit("acquire", client);
		expect(() =>
			client.emit("error", new Error("Connection terminated unexpectedly")),
		).not.toThrow();

		expect(warn).toHaveBeenCalledWith(
			"pg_client_error",
			expect.objectContaining({
				pool: "general",
				error_message: "Connection terminated unexpectedly",
			}),
		);
	});

	test("removes the active client listener when the client is released", () => {
		const pool = createPool();
		const client = createClient();
		attachPoolErrorHandlers({ pool, name: "general" });

		pool.emit("acquire", client);
		expect(client.listenerCount("error")).toBe(1);

		pool.emit("release", undefined, client);
		expect(client.listenerCount("error")).toBe(0);
	});
});
