import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { logRequestResult } from "@/honoMiddlewares/requestLogging/logRequestResult.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { LogRequestContext } from "@/utils/logging/loggerTypes.js";

type CapturedLog = {
	level: "debug" | "info" | "warn" | "error";
	bindings: Record<string, unknown>;
	args: unknown[];
};

const createCapturingLogger = ({
	bindings = {},
	captured,
}: {
	bindings?: Record<string, unknown>;
	captured: CapturedLog[];
}): Logger => ({
	debug: (...args) => captured.push({ level: "debug", bindings, args }),
	info: (...args) => captured.push({ level: "info", bindings, args }),
	warn: (...args) => captured.push({ level: "warn", bindings, args }),
	error: (...args) => captured.push({ level: "error", bindings, args }),
	child: ({ context }) =>
		createCapturingLogger({
			bindings: { ...bindings, ...context },
			captured,
		}),
});

describe("logRequestResult", () => {
	test("restores the full request body on the terminal request record", async () => {
		const captured: CapturedLog[] = [];
		const requestLogContext: LogRequestContext = {
			id: "req_123",
			method: "POST",
			url: "https://api.useautumn.com/v1/check",
			timestamp: 123,
			customer_id: "cus_123",
			query: {},
			body: { feature_id: "messages" },
			name: "POST /v1/check",
		};
		const internalRequestContext = {
			id: requestLogContext.id,
			method: requestLogContext.method,
			url: requestLogContext.url,
			timestamp: requestLogContext.timestamp,
			customer_id: requestLogContext.customer_id,
			query: requestLogContext.query,
			name: requestLogContext.name,
		};
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({
				bindings: { req: internalRequestContext },
				captured,
			}),
			requestLogContext,
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/check" },
			res: {
				status: 200,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;

		await logRequestResult({
			ctx,
			c,
			durationMs: 20,
			responseBody: { allowed: true },
		});

		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("info");
		expect(captured[0]?.bindings.req).toEqual(requestLogContext);
		expect(captured[0]?.bindings.extras).toEqual({});
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 20,
			res: { allowed: true },
		});
	});

	test("keeps request and response bodies unchanged on failed terminal records", async () => {
		const captured: CapturedLog[] = [];
		const requestLogContext: LogRequestContext = {
			id: "req_failed",
			method: "POST",
			url: "https://api.useautumn.com/v1/track",
			timestamp: 123,
			customer_id: "cus_123",
			query: {},
			body: {
				feature_id: "messages",
				value: 10,
			},
			name: "POST /v1/track",
		};
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({
				bindings: {
					req: {
						id: requestLogContext.id,
						method: requestLogContext.method,
						url: requestLogContext.url,
						timestamp: requestLogContext.timestamp,
						query: requestLogContext.query,
						name: requestLogContext.name,
					},
				},
				captured,
			}),
			requestLogContext,
			extraLogs: { operation: "track" },
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/track" },
			res: {
				status: 500,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;
		const responseBody = {
			code: "internal_error",
			message: "Something went wrong",
		};

		await logRequestResult({
			ctx,
			c,
			durationMs: 30,
			responseBody,
		});

		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("warn");
		expect(captured[0]?.bindings.req).toEqual(requestLogContext);
		expect(captured[0]?.bindings.extras).toEqual({ operation: "track" });
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 500,
			durationMs: 30,
			res: responseBody,
		});
	});

	test("still reads and logs successful JSON response bodies when not supplied", async () => {
		const captured: CapturedLog[] = [];
		const responseBody = { allowed: true, balance: 90 };
		let cloneCount = 0;
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/check" },
			res: {
				status: 200,
				headers: new Headers({ "content-type": "application/json" }),
				clone: () => {
					cloneCount++;
					return {
						json: async () => responseBody,
					};
				},
			},
		} as unknown as Context<HonoEnv>;

		await logRequestResult({ ctx, c, durationMs: 10 });

		expect(cloneCount).toBe(1);
		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("info");
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: responseBody,
		});
	});

	test("drops the response body on the legacy events list route", async () => {
		const captured: CapturedLog[] = [];
		let cloneCount = 0;
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/events/list" },
			res: {
				status: 200,
				headers: new Headers({ "content-type": "application/json" }),
				clone: () => {
					cloneCount++;
					return { json: async () => ({ events: [{ id: "evt_1" }] }) };
				},
			},
		} as unknown as Context<HonoEnv>;

		await logRequestResult({ ctx, c, durationMs: 40 });

		expect(cloneCount).toBe(0);
		expect(captured).toHaveLength(1);
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 40,
			res: null,
		});
	});

	test("drops an explicitly supplied response body on the rpc events list route", async () => {
		const captured: CapturedLog[] = [];
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/events.list" },
			res: {
				status: 200,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;

		await logRequestResult({
			ctx,
			c,
			durationMs: 40,
			responseBody: { events: [{ id: "evt_1" }] },
		});

		expect(captured).toHaveLength(1);
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 40,
			res: null,
		});
	});

	test("keeps the response body on failed events list requests", async () => {
		const captured: CapturedLog[] = [];
		const responseBody = { code: "internal_error", message: "boom" };
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/events/list" },
			res: {
				status: 500,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;

		await logRequestResult({ ctx, c, durationMs: 40, responseBody });

		expect(captured).toHaveLength(1);
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 500,
			durationMs: 40,
			res: responseBody,
		});
	});

	test("does not mutate logger context or emit for explicitly skipped routes", async () => {
		const captured: CapturedLog[] = [];
		const logger = createCapturingLogger({ captured });
		const ctx = {
			timestamp: 123,
			logger,
			requestLogContext: {
				id: "req_health",
				method: "GET",
				url: "https://api.useautumn.com/health",
				timestamp: 123,
				query: {},
				body: undefined,
				name: "GET /health",
			},
			extraLogs: {},
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/health" },
			res: {
				status: 200,
				headers: new Headers(),
			},
		} as Context<HonoEnv>;

		await logRequestResult({
			ctx,
			c,
			skipUrls: ["/health"],
		});

		expect(captured).toHaveLength(0);
		expect(ctx.logger).toBe(logger);
	});
});
