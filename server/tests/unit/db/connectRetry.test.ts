import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { Pool, PoolClient } from "pg";

import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const warn = mock((..._args: unknown[]) => {});
await mockModuleWithRestore("@/external/logtail/logtailUtils.js", () => ({
	logger: {
		info: mock(() => {}),
		warn,
		error: mock(() => {}),
		debug: mock(() => {}),
		child: () => ({}),
	},
}));

const { applyConnectRefusedRetry, connectRefusedRetryJitterMs } = await import(
	"@/db/connectRetry.js"
);

const maxClientConnError = () =>
	new Error("error: no more connections allowed (max_client_conn)");

const econnrefusedError = () =>
	Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:6432"), {
		code: "ECONNREFUSED",
	});

const checkoutTimeoutError = () =>
	new Error("timeout exceeded when trying to connect");

const fakeClient = (): PoolClient =>
	({ release: mock(() => {}) }) as unknown as PoolClient;

/** Pool whose connect() consumes `outcomes` in order (Error = reject). */
const buildFakePool = (outcomes: (Error | PoolClient)[]) => {
	const connect = mock(() => {
		const next = outcomes.shift();
		if (next instanceof Error) return Promise.reject(next);
		return Promise.resolve(next);
	});
	const pool = { connect } as unknown as Pool;
	applyConnectRefusedRetry({ pool, name: "critical" });
	return { pool, underlyingConnect: connect };
};

afterEach(() => {
	warn.mockClear();
	mock.restore();
});

describe("applyConnectRefusedRetry", () => {
	it("retries once with jitter on a max_client_conn refusal and returns the client", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const client = fakeClient();
		const { pool, underlyingConnect } = buildFakePool([
			maxClientConnError(),
			client,
		]);

		const startedAt = performance.now();
		const result = await pool.connect();
		const elapsedMs = performance.now() - startedAt;

		expect(result).toBe(client);
		expect(underlyingConnect).toHaveBeenCalledTimes(2);
		// Math.random stubbed to 0 → jitter is exactly the 100ms floor.
		expect(elapsedMs).toBeGreaterThanOrEqual(95);
		expect(elapsedMs).toBeLessThan(300);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toBe("pg_connect_refused_retry");
		expect(warn.mock.calls[0]?.[1]).toMatchObject({
			type: "pg_connect_refused_retry",
			pool: "critical",
		});
	});

	it("propagates the second refusal unchanged after one retry", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const secondError = maxClientConnError();
		const { pool, underlyingConnect } = buildFakePool([
			maxClientConnError(),
			secondError,
		]);

		await expect(pool.connect()).rejects.toBe(secondError);
		expect(underlyingConnect).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("never retries checkout timeouts — propagates immediately", async () => {
		const timeoutError = checkoutTimeoutError();
		const { pool, underlyingConnect } = buildFakePool([
			timeoutError,
			fakeClient(),
		]);

		await expect(pool.connect()).rejects.toBe(timeoutError);
		expect(underlyingConnect).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("retries on ECONNREFUSED code", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const client = fakeClient();
		const { pool, underlyingConnect } = buildFakePool([
			econnrefusedError(),
			client,
		]);

		await expect(pool.connect()).resolves.toBe(client);
		expect(underlyingConnect).toHaveBeenCalledTimes(2);
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("does not retry non-refusal errors", async () => {
		const queryError = new Error("password authentication failed");
		const { pool, underlyingConnect } = buildFakePool([
			queryError,
			fakeClient(),
		]);

		await expect(pool.connect()).rejects.toBe(queryError);
		expect(underlyingConnect).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it("supports the callback connect form through a retry", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const client = fakeClient();
		const { pool, underlyingConnect } = buildFakePool([
			maxClientConnError(),
			client,
		]);

		const received = await new Promise<PoolClient | undefined>(
			(resolve, reject) => {
				pool.connect((err, connectedClient) => {
					if (err) return reject(err);
					resolve(connectedClient);
				});
			},
		);

		expect(received).toBe(client);
		expect(underlyingConnect).toHaveBeenCalledTimes(2);
	});
});

describe("connectRefusedRetryJitterMs", () => {
	it("stays within the 100-300ms band", () => {
		for (let i = 0; i < 1000; i++) {
			const jitterMs = connectRefusedRetryJitterMs();
			expect(jitterMs).toBeGreaterThanOrEqual(100);
			expect(jitterMs).toBeLessThanOrEqual(300);
		}
	});
});
