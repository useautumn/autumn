import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FailOpenHook } from "../src/hooks/failOpenHook.js";
import type { AfterErrorContext } from "../src/hooks/types.js";
import type { SDKOptions } from "../src/lib/config.js";

const originalFetch = globalThis.fetch;
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
	console.log = () => {};
	console.error = () => {};
});

afterEach(() => {
	globalThis.fetch = originalFetch;
	console.log = originalConsoleLog;
	console.error = originalConsoleError;
});

const getHookContext = (operationID: string): AfterErrorContext => ({
	baseURL: "https://api.useautumn.com",
	operationID,
	oAuth2Scopes: null,
	retryConfig: { strategy: "none" },
	resolvedSecurity: null,
	options: {},
});

const runRequest = async ({
	hook,
	operationID,
	path = "/v1/test",
	signal,
}: {
	hook: FailOpenHook;
	operationID: string;
	path?: string;
	signal?: AbortSignal;
}) => {
	const options = hook.sdkInit({} satisfies SDKOptions);
	const httpClient = options.httpClient;
	if (!httpClient) throw new Error("Expected fail-open HTTP client");

	const response = await httpClient.request(
		new Request(`https://api.useautumn.com${path}`, {
			method: "POST",
			body: JSON.stringify({ id: "test" }),
			signal,
		}),
	);

	return hook.afterError(getHookContext(operationID), response, null);
};

describe("FailOpenHook network retries", () => {
	test.each([
		["getEntity", "/v1/entities.get"],
		["getCustomer", "/v1/customers.get"],
		["getOrCreateCustomer", "/v1/customers.get_or_create"],
	])("retries %s once after a network failure", async (operationID, path) => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls += 1;
			if (calls === 1) {
				throw new DOMException("Timed out", "TimeoutError");
			}
			return Response.json({ success: true });
		}) as typeof fetch;

		const result = await runRequest({
			hook: new FailOpenHook(),
			operationID,
			path,
		});

		expect(calls).toBe(2);
		expect(result.response?.status).toBe(200);
		expect(result.error).toBeNull();
	});

	test("uses a fresh timeout signal for the retry", async () => {
		const controller = new AbortController();
		let calls = 0;
		globalThis.fetch = (async (input) => {
			calls += 1;
			if (calls === 1) {
				controller.abort(new DOMException("Timed out", "TimeoutError"));
				throw controller.signal.reason;
			}

			expect(new Request(input).signal.aborted).toBeFalse();
			return Response.json({ success: true });
		}) as typeof fetch;

		const result = await runRequest({
			hook: new FailOpenHook(),
			operationID: "getCustomer",
			path: "/v1/customers.get",
			signal: controller.signal,
		});

		expect(calls).toBe(2);
		expect(result.response?.status).toBe(200);
	});

	test("does not retry an explicit caller abort", async () => {
		const controller = new AbortController();
		controller.abort();
		let calls = 0;
		globalThis.fetch = (async (input) => {
			calls += 1;
			throw new Request(input).signal.reason;
		}) as typeof fetch;

		const result = await runRequest({
			hook: new FailOpenHook(),
			operationID: "getCustomer",
			path: "/v1/customers.get",
			signal: controller.signal,
		});

		expect(calls).toBe(1);
		expect(result.response?.status).toBe(555);
	});

	test("does not retry other operations", async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls += 1;
			throw new TypeError("fetch failed");
		}) as typeof fetch;

		const result = await runRequest({
			hook: new FailOpenHook(),
			operationID: "track",
		});

		expect(calls).toBe(1);
		expect(result.response?.status).toBe(200);
		expect(result.error).toBeNull();
	});

	test("returns 555 after the selected operation retry also fails", async () => {
		let calls = 0;
		globalThis.fetch = (async () => {
			calls += 1;
			throw new TypeError("fetch failed");
		}) as typeof fetch;

		const result = await runRequest({
			hook: new FailOpenHook(),
			operationID: "getCustomer",
			path: "/v1/customers.get",
		});

		expect(calls).toBe(2);
		expect(result.response?.status).toBe(555);
		expect(result.error).toBeNull();
	});
});
