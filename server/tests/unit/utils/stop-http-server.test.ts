import { describe, expect, mock, test } from "bun:test";
import type http from "node:http";
import {
	createHttpRequestTracker,
	stopHttpServer,
} from "@/utils/stopHttpServer.js";

describe("stopHttpServer", () => {
	test("tracks the handler promise independently of the connection", async () => {
		let releaseHandler: () => void = () => undefined;
		const handlerReleased = new Promise<void>((resolve) => {
			releaseHandler = resolve;
		});
		const tracker = createHttpRequestTracker({
			requestHandler: async () => {
				await handlerReleased;
				return new Response("done");
			},
		});

		const request = tracker.requestHandler();
		expect(tracker.hasActiveRequests()).toBeTrue();
		let waitResolved = false;
		const waitForActiveRequests = tracker.waitForActiveRequests().then(() => {
			waitResolved = true;
		});
		await Bun.sleep(0);
		expect(waitResolved).toBeFalse();

		releaseHandler();
		await request;
		await waitForActiveRequests;
		expect(tracker.hasActiveRequests()).toBeFalse();
		expect(waitResolved).toBeTrue();
	});

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

		const requestsDrained = await stopHttpServer({
			server,
			shutdownTimeoutMs: 5,
		});
		await Bun.sleep(10);

		expect(requestsDrained).toBeTrue();
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
			stopHttpServer({ server, shutdownTimeoutMs: 5 }),
			Bun.sleep(50).then(() => "test-timeout"),
		]);

		expect(outcome).toBeTrue();
		expect(closeIdleConnections).toHaveBeenCalledTimes(1);
		expect(closeAllConnections).toHaveBeenCalledTimes(1);
	});

	test("waits for a force-closed handler before reporting a clean drain", async () => {
		let releaseHandler: () => void = () => undefined;
		const handlerReleased = new Promise<void>((resolve) => {
			releaseHandler = resolve;
		});
		const tracker = createHttpRequestTracker({
			requestHandler: async () => {
				await handlerReleased;
				return new Response("done");
			},
		});
		void tracker.requestHandler();
		const closeAllConnections = mock(() => undefined);
		const server = {
			close: () => server,
			closeIdleConnections: mock(() => undefined),
			closeAllConnections,
		} as unknown as http.Server;
		let shutdownResolved = false;

		const shutdown = stopHttpServer({
			server,
			shutdownTimeoutMs: 5,
			activeRequestTimeoutMs: 50,
			hasActiveRequests: tracker.hasActiveRequests,
			waitForActiveRequests: tracker.waitForActiveRequests,
		}).then((result) => {
			shutdownResolved = true;
			return result;
		});

		await Bun.sleep(10);
		expect(closeAllConnections).toHaveBeenCalledTimes(1);
		expect(shutdownResolved).toBeFalse();

		releaseHandler();
		expect(await shutdown).toBeTrue();
	});

	test("grants a final handler grace window before reporting forced exit", async () => {
		let releaseHandler: () => void = () => undefined;
		const handlerReleased = new Promise<void>((resolve) => {
			releaseHandler = resolve;
		});
		const tracker = createHttpRequestTracker({
			requestHandler: async () => {
				await handlerReleased;
				return new Response("done");
			},
		});
		void tracker.requestHandler();
		const server = {
			close: () => server,
			closeIdleConnections: mock(() => undefined),
			closeAllConnections: mock(() => undefined),
		} as unknown as http.Server;
		const shutdown = stopHttpServer({
			server,
			shutdownTimeoutMs: 2,
			activeRequestTimeoutMs: 2,
			forcedRequestGraceMs: 25,
			hasActiveRequests: tracker.hasActiveRequests,
			waitForActiveRequests: tracker.waitForActiveRequests,
		});
		setTimeout(releaseHandler, 10);

		expect(await shutdown).toBeTrue();
	});

	test("does not report a clean drain when a handler survives force-close", async () => {
		const closeIdleConnections = mock(() => undefined);
		const closeAllConnections = mock(() => undefined);
		const server = {
			close: () => server,
			closeIdleConnections,
			closeAllConnections,
		} as unknown as http.Server;

		const requestsDrained = await stopHttpServer({
			server,
			shutdownTimeoutMs: 5,
			activeRequestTimeoutMs: 5,
			hasActiveRequests: () => true,
			waitForActiveRequests: () => new Promise(() => undefined),
		});

		expect(requestsDrained).toBeFalse();
		expect(closeAllConnections).toHaveBeenCalledTimes(1);
	});
});
