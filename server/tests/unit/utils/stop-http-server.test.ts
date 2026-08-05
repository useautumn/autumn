import { describe, expect, mock, test } from "bun:test";
import type http from "node:http";
import { stopHttpServer } from "@/utils/stopHttpServer.js";

describe("stopHttpServer", () => {
	test("does not force-close connections after graceful close completes", async () => {
		const closeIdleConnections = mock(() => undefined);
		const closeAllConnections = mock(() => undefined);
		const server = {
			close: (callback: (error?: Error) => void) => {
				callback();
				return server;
			},
			closeIdleConnections,
			closeAllConnections,
		} as unknown as http.Server;

		await stopHttpServer({ server, shutdownTimeoutMs: 5 });
		await Bun.sleep(10);

		expect(closeIdleConnections).toHaveBeenCalledTimes(1);
		expect(closeAllConnections).not.toHaveBeenCalled();
	});

	test("force-closes active connections when graceful close reaches its deadline", async () => {
		const closeIdleConnections = mock(() => undefined);
		const closeAllConnections = mock(() => undefined);
		const server = {
			close: () => server,
			closeIdleConnections,
			closeAllConnections,
		} as unknown as http.Server;

		const outcome = await Promise.race([
			stopHttpServer({ server, shutdownTimeoutMs: 5 }).then(() => "closed"),
			Bun.sleep(50).then(() => "test-timeout"),
		]);

		expect(outcome).toBe("closed");
		expect(closeIdleConnections).toHaveBeenCalledTimes(1);
		expect(closeAllConnections).toHaveBeenCalledTimes(1);
	});
});
