import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { Context } from "hono";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { logRequestResult } from "@/honoMiddlewares/requestLogging/logRequestResult.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import { _setMiscellaneousEdgeConfigForTesting } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { addRequestToLogs } from "@/utils/logging/addContextToLogs.js";
import type { LogRequestContext } from "@/utils/logging/loggerTypes.js";

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

const captureJsonResponse = async ({
	path,
	durationMs,
	responseBody,
}: {
	path: string;
	durationMs: number;
	responseBody: unknown;
}) => {
	const captured: CapturedLog[] = [];
	let cloneCount = 0;
	const ctx = {
		timestamp: 123,
		logger: createCapturingLogger({ captured }),
		extraLogs: {},
		org: { slug: "test-org" },
	} as unknown as AutumnContext;
	const c = {
		req: { path },
		res: {
			status: 200,
			headers: new Headers({ "content-type": "application/json" }),
			clone: () => {
				cloneCount++;
				return { text: async () => JSON.stringify(responseBody) };
			},
		},
	} as unknown as Context<HonoEnv>;

	await logRequestResult({ ctx, c, durationMs });
	return { captured, cloneCount };
};

afterEach(() => {
	mock.restore();
	_setMiscellaneousEdgeConfigForTesting({
		config: MiscellaneousEdgeConfigSchema.parse({}),
	});
});

describe("logRequestResult", () => {
	test("logs the request body without rebinding request metadata", async () => {
		const captured: CapturedLog[] = [];
		const requestLogContext: LogRequestContext = {
			id: "req_123",
			method: "POST",
			url: "https://api.useautumn.com/v1/customers.get",
			timestamp: 123,
			customer_id: "cus_123",
			query: {},
			body: { feature_id: "messages" },
			name: "POST /v1/customers.get",
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
			req: { path: "/v1/customers.get" },
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

		expect(captured).toHaveLength(1);
		expect(captured[0]?.level).toBe("warn");
		expect(captured[0]?.bindings.req).toBeUndefined();
		expect(captured[0]?.bindings.extras).toEqual({ operation: "track" });
		expect(mergeLoggedObjects(captured[0]?.args ?? [])).toEqual({
			req: requestLogContext,
			statusCode: 500,
			durationMs: 30,
			res: responseBody,
		});
	});

	test("compacts an unsampled fast high-volume response", async () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const responseBody = {
			allowed: true,
			required_balance: 1,
			preview: { scenario: "upgrade" },
			balance: {
				feature_id: "messages",
				remaining: 90,
				usage: 10,
				granted: 100,
				overage_allowed: false,
				breakdown: [{ id: "cus_ent_123", remaining: 90 }],
			},
		};
		const { captured, cloneCount } = await captureJsonResponse({
			path: "/v1/balances.check",
			durationMs: 10,
			responseBody,
		});

		expect(cloneCount).toBe(1);
		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: {
				allowed: true,
				required_balance: 1,
				balance: {
					feature_id: "messages",
					remaining: 90,
					usage: 10,
					granted: 100,
					overage_allowed: false,
				},
			},
		});
	});

	test("keeps compact multi-feature track diagnostics", async () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const responseBody = {
			customer_id: "cus_123",
			event_name: "api_call",
			value: 45.67,
			balance: null,
			balances: {
				action1: {
					object: "balance",
					feature_id: "action1",
					current_balance: 154.33,
					usage: 45.67,
					max_purchase: null,
					feature: { id: "action1", name: "Action 1" },
					breakdown: [{ id: "cus_ent_action1" }],
					rollovers: [{ id: "rollover_action1" }],
				},
				action3: {
					object: "balance",
					feature_id: "action3",
					current_balance: 104.33,
					usage: 45.67,
					max_purchase: null,
					breakdown: [{ id: "cus_ent_action3" }],
				},
			},
			deductions: [
				{
					balance_id: "cus_ent_action1",
					feature_id: "action1",
					plan_id: "free",
					reset: null,
					value: 45.67,
				},
			],
			flag: {
				object: "flag",
				id: "cus_ent_flag",
				feature_id: "premium",
				plan_id: "free",
				expires_at: null,
				feature: { id: "premium", name: "Premium" },
			},
		};
		const { captured } = await captureJsonResponse({
			path: "/v1/track",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: {
				customer_id: "cus_123",
				event_name: "api_call",
				value: 45.67,
				balance: null,
				balances: {
					action1: {
						object: "balance",
						feature_id: "action1",
						current_balance: 154.33,
						usage: 45.67,
						max_purchase: null,
					},
					action3: {
						object: "balance",
						feature_id: "action3",
						current_balance: 104.33,
						usage: 45.67,
						max_purchase: null,
					},
				},
				deductions: [
					{
						balance_id: "cus_ent_action1",
						feature_id: "action1",
						plan_id: "free",
						reset: null,
						value: 45.67,
					},
				],
				flag: {
					object: "flag",
					id: "cus_ent_flag",
					feature_id: "premium",
					plan_id: "free",
					expires_at: null,
				},
			},
		});
	});

	test("compacts additional high-volume response shapes", async () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const subjectResponseBody = {
			id: "cus_123",
			name: "Acme",
			balances: {
				messages: {
					remaining: 90,
					breakdown: [
						{
							id: "cus_ent_123",
							remaining: 90,
							metadata: "x".repeat(32 * 1024),
						},
					],
					feature: { id: "messages", name: "Messages" },
				},
			},
			subscriptions: [{ id: "sub_123", plan_id: "pro" }],
			purchases: [{ id: "purchase_123", plan_id: "credits" }],
		};

		for (const path of [
			"/v1/entities.get",
			"/v1/customers.get",
			"/v1/customers.get_or_create",
		]) {
			const { captured } = await captureJsonResponse({
				path,
				durationMs: 10,
				responseBody: subjectResponseBody,
			});

			expect(captured[0]?.args[1]).toEqual({
				statusCode: 200,
				durationMs: 10,
				res: {
					id: "cus_123",
					name: "Acme",
					balances: { messages: { remaining: 90 } },
					subscriptions_count: 1,
					purchases_count: 1,
				},
			});
		}

		const { captured: aggregateCaptured } = await captureJsonResponse({
			path: "/v1/events.aggregate",
			durationMs: 10,
			responseBody: {
				list: [{ period: 1, values: { messages: 10 } }],
				total: 10,
				deductions: [{ period: 1, values: { messages: 4 } }],
			},
		});
		expect(aggregateCaptured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: { total: 10, list_count: 1, deductions_count: 1 },
		});

		const { captured: plansCaptured } = await captureJsonResponse({
			path: "/v1/plans.list",
			durationMs: 10,
			responseBody: {
				list: [{ id: "pro", items: [{ feature_id: "messages" }] }],
			},
		});
		expect(plansCaptured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: { list_count: 1 },
		});
	});

	test("summarizes an object response larger than the logging cap", async () => {
		const responseBody = {
			id: "cus_123",
			payload: "x".repeat(32 * 1024),
		};
		const { captured } = await captureJsonResponse({
			path: "/v1/customers.list",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: {
				truncated: true,
				original_bytes: Buffer.byteLength(JSON.stringify(responseBody)),
				top_level_keys: ["id", "payload"],
				top_level_key_count: 2,
			},
		});
	});

	test("summarizes a top-level array larger than the logging cap", async () => {
		const responseBody = [{ payload: "x".repeat(32 * 1024) }];
		const { captured } = await captureJsonResponse({
			path: "/v1/customers.list",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: {
				truncated: true,
				original_bytes: Buffer.byteLength(JSON.stringify(responseBody)),
			},
		});
	});

	test("bounds oversized response key diagnostics", async () => {
		const responseBody = Object.fromEntries(
			Array.from({ length: 100 }, (_, index) => [
				`key_${index}_${"x".repeat(160)}`,
				"value".repeat(100),
			]),
		);
		const { captured } = await captureJsonResponse({
			path: "/v1/customers.list",
			durationMs: 10,
			responseBody,
		});
		const loggedResponse = captured[0]?.args[1] as {
			res: {
				top_level_keys: string[];
				top_level_key_count: number;
			};
		};

		expect(loggedResponse.res.top_level_keys).toHaveLength(50);
		expect(loggedResponse.res.top_level_key_count).toBe(100);
		expect(
			loggedResponse.res.top_level_keys.every((key) => key.length <= 128),
		).toBe(true);
		expect(
			Buffer.byteLength(JSON.stringify(loggedResponse.res)),
		).toBeLessThanOrEqual(32 * 1024);
	});

	test("reports original keys when a compacted response still exceeds the cap", async () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const responseBody = {
			id: "cus_123",
			subscriptions: [{ id: "sub_123" }],
			payload: "x".repeat(32 * 1024),
		};
		const { captured } = await captureJsonResponse({
			path: "/v1/customers.get",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: {
				truncated: true,
				original_bytes: Buffer.byteLength(JSON.stringify(responseBody)),
				top_level_keys: ["id", "subscriptions", "payload"],
				top_level_key_count: 3,
			},
		});
	});

	test("keeps the one-percent sampled response in full above the logging cap", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const responseBody = {
			allowed: true,
			payload: "x".repeat(32 * 1024),
		};
		const { captured } = await captureJsonResponse({
			path: "/v1/balances.check",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: responseBody,
		});
	});

	test("keeps full response bodies when Axiom reduction is disabled", async () => {
		_setMiscellaneousEdgeConfigForTesting({
			config: MiscellaneousEdgeConfigSchema.parse({
				axiomResponseBodyReduction: false,
			}),
		});
		spyOn(Math, "random").mockReturnValue(0.5);
		const responseBody = {
			allowed: true,
			balance: {
				remaining: 90,
				breakdown: [{ id: "cus_ent_123" }],
			},
			payload: "x".repeat(32 * 1024),
		};
		const { captured } = await captureJsonResponse({
			path: "/v1/balances.check",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: responseBody,
		});
	});

	test("keeps a sampled fast high-volume response in full", async () => {
		spyOn(Math, "random").mockReturnValue(0);
		const responseBody = { allowed: true, balance: { remaining: 90 } };
		const { captured } = await captureJsonResponse({
			path: "/v1/balances.check",
			durationMs: 10,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 10,
			res: responseBody,
		});
	});

	test("keeps a slow high-volume response in full", async () => {
		spyOn(Math, "random").mockReturnValue(0.5);
		const responseBody = { allowed: true, balance: { remaining: 90 } };
		const { captured } = await captureJsonResponse({
			path: "/v1/balances.check",
			durationMs: 500,
			responseBody,
		});

		expect(captured[0]?.args[1]).toEqual({
			statusCode: 200,
			durationMs: 500,
			res: responseBody,
		});
	});

	test("still reads and logs successful JSON response bodies for other routes", async () => {
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
			req: { path: "/v1/customers.get" },
			res: {
				status: 200,
				headers: new Headers({ "content-type": "application/json" }),
				clone: () => {
					cloneCount++;
					return {
						text: async () => JSON.stringify(responseBody),
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

	test("keeps the legacy events list exclusion when reduction is disabled", async () => {
		_setMiscellaneousEdgeConfigForTesting({
			config: MiscellaneousEdgeConfigSchema.parse({
				axiomResponseBodyReduction: false,
			}),
		});
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
					return {
						text: async () => JSON.stringify({ events: [{ id: "evt_1" }] }),
					};
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
