import { describe, expect, spyOn, test } from "bun:test";
import type { Context } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { logRequestResult } from "@/honoMiddlewares/requestLogging/logRequestResult.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { addRequestToLogs } from "@/utils/logging/addContextToLogs.js";
import type { LogRequestContext } from "@/utils/logging/loggerTypes.js";

// Rate 1 makes the high-volume success sampler deterministic (Math.random() < 1
// always holds); the module reads this lazily on first use, so set it up front.
process.env.AXIOM_SUCCESS_REQUEST_LOG_SAMPLE_RATE = "1";

type CapturedLog = {
	level: "debug" | "info" | "warn" | "error";
	bindings: Record<string, unknown>;
	bindingLayers: Record<string, unknown>[];
	args: unknown[];
};

const createCapturingLogger = ({
	bindings = {},
	bindingLayers = [bindings],
	captured,
}: {
	bindings?: Record<string, unknown>;
	bindingLayers?: Record<string, unknown>[];
	captured: CapturedLog[];
}): Logger => ({
	debug: (...args) =>
		captured.push({ level: "debug", bindings, bindingLayers, args }),
	info: (...args) =>
		captured.push({ level: "info", bindings, bindingLayers, args }),
	warn: (...args) =>
		captured.push({ level: "warn", bindings, bindingLayers, args }),
	error: (...args) =>
		captured.push({ level: "error", bindings, bindingLayers, args }),
	child: ({ context }) =>
		createCapturingLogger({
			bindings: { ...bindings, ...context },
			bindingLayers: [...bindingLayers, context],
			captured,
		}),
});

const mergeLoggedObjects = (args: unknown[]) =>
	Object.assign(
		{},
		...args.filter(
			(argument): argument is Record<string, unknown> =>
				typeof argument === "object" && argument !== null,
		),
	);

describe("logRequestResult", () => {
	test("logs the request body without rebinding request metadata", async () => {
		const captured: CapturedLog[] = [];
		const requestLogContext: LogRequestContext = {
			id: "req_123",
			method: "POST",
			url: "https://api.useautumn.com/v1/check",
			timestamp: 123,
			customer_id: "cus_123",
			query: JSON.stringify({}),
			body: JSON.stringify({ feature_id: "messages" }),
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
			logger: addRequestToLogs({
				logger: createCapturingLogger({ captured }),
				requestContext: internalRequestContext,
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
		expect(
			captured[0]?.bindingLayers.filter((bindings) => "req" in bindings),
		).toHaveLength(0);
		expect(captured[0]?.bindings.req).toBeUndefined();
		expect(captured[0]?.bindings.extras).toEqual({});
		expect(mergeLoggedObjects(captured[0]?.args ?? [])).toEqual({
			req: requestLogContext,
			statusCode: 200,
			durationMs: 20,
			res: JSON.stringify({ allowed: true }),
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
			query: JSON.stringify({}),
			body: JSON.stringify({
				feature_id: "messages",
				value: 10,
			}),
			name: "POST /v1/track",
		};
		const ctx = {
			timestamp: 123,
			logger: addRequestToLogs({
				logger: createCapturingLogger({ captured }),
				requestContext: {
					id: requestLogContext.id,
					method: requestLogContext.method,
					url: requestLogContext.url,
					timestamp: requestLogContext.timestamp,
					query: requestLogContext.query,
					name: requestLogContext.name,
				},
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

		// NODE_ENV=development (run.sh) adds an EXTRA LOGS debug line — ignore it.
		const emitted = captured.filter((log) => log.level !== "debug");
		expect(emitted).toHaveLength(1);
		expect(emitted[0]?.level).toBe("warn");
		expect(emitted[0]?.bindings.req).toBeUndefined();
		expect(emitted[0]?.bindings.extras).toEqual({ operation: "track" });
		expect(mergeLoggedObjects(emitted[0]?.args ?? [])).toEqual({
			req: requestLogContext,
			statusCode: 500,
			durationMs: 30,
			res: JSON.stringify(responseBody),
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
			res: JSON.stringify(responseBody),
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
			res: JSON.stringify(responseBody),
		});
	});

	test("skips a 429 on a high volume route when the sampler says no", async () => {
		const captured: CapturedLog[] = [];
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
				status: 429,
				headers: new Headers({ "content-type": "application/json" }),
				clone: () => {
					cloneCount++;
					return { json: async () => ({ code: "rate_limited" }) };
				},
			},
		} as unknown as Context<HonoEnv>;

		// Rate is memoized at 1, so force sample-out via Math.random() = 1 (1 < 1 fails).
		const randomSpy = spyOn(Math, "random").mockReturnValue(1);
		try {
			await logRequestResult({ ctx, c, durationMs: 5 });
		} finally {
			randomSpy.mockRestore();
		}

		expect(captured).toHaveLength(0);
		expect(cloneCount).toBe(0);
	});

	test("always logs a 429 on a non high volume route", async () => {
		const captured: CapturedLog[] = [];
		const responseBody = { code: "rate_limited", message: "Too many requests" };
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/attach" },
			res: {
				status: 429,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;

		const randomSpy = spyOn(Math, "random").mockReturnValue(1);
		try {
			await logRequestResult({ ctx, c, durationMs: 5, responseBody });
		} finally {
			randomSpy.mockRestore();
		}

		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("warn");
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 429,
			durationMs: 5,
			res: JSON.stringify(responseBody),
		});
	});

	test("always logs a 500 on a high volume route", async () => {
		const captured: CapturedLog[] = [];
		const responseBody = { code: "internal_error", message: "boom" };
		const ctx = {
			timestamp: 123,
			logger: createCapturingLogger({ captured }),
			extraLogs: {},
			org: { slug: "test-org" },
		} as unknown as AutumnContext;
		const c = {
			req: { path: "/v1/check" },
			res: {
				status: 500,
				headers: new Headers({ "content-type": "application/json" }),
			},
		} as Context<HonoEnv>;

		const randomSpy = spyOn(Math, "random").mockReturnValue(1);
		try {
			await logRequestResult({ ctx, c, durationMs: 5, responseBody });
		} finally {
			randomSpy.mockRestore();
		}

		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("warn");
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 500,
			durationMs: 5,
			res: JSON.stringify(responseBody),
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
