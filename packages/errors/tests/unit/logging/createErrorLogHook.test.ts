import { describe, expect, it, mock } from "bun:test";
import { Writable } from "node:stream";
import type { Event } from "@sentry/bun";

const captureException = mock(() => "event_123");
const captureEvent = mock((_event: Event) => "event_456");
const loggedFrames = [
	{
		filename: "/app/server/src/sync/syncBatching.ts",
		function: "queueSyncJob",
	},
	{
		filename: "/app/server/src/external/logtail/logtailUtils.ts",
		function: "log",
	},
	{ filename: "/app/node_modules/pino/pino.js", function: "LOG" },
	{
		filename: "/app/packages/errors/src/logging/prepareErrorLog.ts",
		function: "prepareErrorLog",
	},
];
const stackParser = mock(() => loggedFrames);
mock.module("@sentry/bun", () => ({
	captureException,
	captureEvent,
	getClient: () => ({
		getOptions: () => ({ stackParser }),
	}),
}));

const pino = (await import("pino")).default;
const { RecaseError } = await import("@autumn/shared");
const { createErrorLogHook } = await import(
	"../../../src/logging/createErrorLogHook.js"
);

const createTestLogger = ({ captureToSentry = true } = {}) => {
	const lines: Record<string, unknown>[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			lines.push(JSON.parse(chunk.toString()));
			callback();
		},
	});
	const logger = pino(
		{
			hooks: {
				logMethod: createErrorLogHook({
					service: "server",
					captureToSentry,
					loggerFramePaths: ["/external/logtail/"],
				}),
			},
		},
		stream,
	);
	const jobLogger = logger
		.child({ context: { org_id: "org_1", org_slug: "acme", env: "live" } })
		.child({ workflow: { id: "job_1", name: "track" } });
	return { logger, jobLogger, lines };
};

describe("createErrorLogHook", () => {
	it("sends an error-level bug to Sentry with the logger's org context as tags", () => {
		captureException.mockClear();
		const { jobLogger } = createTestLogger();
		const error = new TypeError("x is undefined");

		jobLogger.error({ error }, "track failed");

		expect(captureException).toHaveBeenCalledWith(error, {
			tags: {
				error_kind: "bug",
				error_code: undefined,
				service: "server",
				operation: "track",
				env: "live",
				org_id: "org_1",
				org_slug: "acme",
			},
			user: { id: "org_1", username: "acme" },
			contexts: {
				autumn: {
					org_id: "org_1",
					customer_id: undefined,
					entity_id: undefined,
					request_id: "job_1",
				},
			},
		});
	});

	it("uses an error's own fingerprint so shared-stack errors split into issues", () => {
		captureException.mockClear();
		const { jobLogger } = createTestLogger();
		const error = Object.assign(new Error("track timed out"), {
			fingerprint: ["job-timeout", "track"],
		});

		jobLogger.error({ error }, "timed out");

		expect(captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({ fingerprint: ["job-timeout", "track"] }),
		);
	});

	it("groups Stripe errors by code and operation, not the SDK's stack", () => {
		captureException.mockClear();
		const { jobLogger } = createTestLogger();
		const error = Object.assign(new Error("No such invoice: 'in_1'"), {
			type: "StripeInvalidRequestError",
			code: "resource_missing",
		});

		jobLogger.error({ error }, "failed");

		expect(captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({
				fingerprint: ["stripe", "resource_missing", "track"],
			}),
		);
	});

	it("prefers the request's route template over its concrete path", () => {
		captureException.mockClear();
		const { logger } = createTestLogger();

		logger
			.child({
				req: {
					id: "req_1",
					name: "GET /v1/customers/cus_1",
					route: "GET /v1/customers/:customer_id",
				},
			})
			.error({ error: new Error("boom") }, "failed");

		expect(captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: expect.objectContaining({
					operation: "GET /v1/customers/:customer_id",
				}),
			}),
		);
	});

	it.each(["live", "sandbox"])(
		"groups Stripe webhook delivery and replay together in %s without changing their operation tags",
		(env) => {
			captureException.mockClear();
			const { logger } = createTestLogger();
			const webhookLogger = logger.child({ context: { env } });
			const operation = `POST /webhooks/connect/${env}`;
			const origins = [
				{ req: { name: operation } },
				{ req: { name: operation, route: "POST /webhooks/connect/:env" } },
				{ req: { name: `POST /webhooks/stripe/org_1/${env}` } },
				{
					req: {
						name: `POST /webhooks/stripe/org_1/${env}`,
						route: "POST /webhooks/stripe/:orgId/:env",
					},
				},
				{ workflow: { name: "stripe-webhook-replay" } },
			];

			for (const origin of origins) {
				const error = Object.assign(new Error("Stripe request failed"), {
					type: "StripeInvalidRequestError",
				});
				webhookLogger.child(origin).error({ error }, "failed");

				expect(captureException).toHaveBeenLastCalledWith(
					error,
					expect.objectContaining({
						fingerprint: ["stripe", "StripeInvalidRequestError", operation],
						tags: expect.objectContaining({
							env,
							operation:
								origin.workflow?.name ?? origin.req?.route ?? origin.req?.name,
						}),
					}),
				);
			}

			expect(captureException).toHaveBeenCalledTimes(origins.length);
		},
	);

	it.each(["resource_missing", "parameter_invalid_integer"])(
		"keeps the Stripe code %s in the webhook replay grouping key",
		(code) => {
			captureException.mockClear();
			const { logger } = createTestLogger();
			const error = Object.assign(new Error("Stripe request failed"), {
				type: "StripeInvalidRequestError",
				code,
			});

			logger
				.child({
					context: { env: "live" },
					workflow: { name: "stripe-webhook-replay" },
				})
				.error({ error }, "failed");

			expect(captureException).toHaveBeenLastCalledWith(
				error,
				expect.objectContaining({
					fingerprint: ["stripe", code, "POST /webhooks/connect/live"],
				}),
			);
		},
	);

	it.each([undefined, "unknown"])(
		"preserves Stripe replay grouping when the environment is %s",
		(env) => {
			captureException.mockClear();
			const { logger } = createTestLogger();
			const error = Object.assign(new Error("Stripe request failed"), {
				type: "StripeInvalidRequestError",
			});

			logger
				.child({
					context: { env },
					workflow: { name: "stripe-webhook-replay" },
				})
				.error({ error }, "failed");

			expect(captureException).toHaveBeenLastCalledWith(
				error,
				expect.objectContaining({
					fingerprint: [
						"stripe",
						"StripeInvalidRequestError",
						"stripe-webhook-replay",
					],
				}),
			);
		},
	);

	it("preserves explicit fingerprints on Stripe webhook replay errors", () => {
		captureException.mockClear();
		const { logger } = createTestLogger();
		const error = Object.assign(new Error("Stripe request failed"), {
			type: "StripeInvalidRequestError",
			fingerprint: ["specific-stripe-failure"],
		});

		logger
			.child({
				context: { env: "live" },
				workflow: { name: "stripe-webhook-replay" },
			})
			.error({ error }, "failed");

		expect(captureException).toHaveBeenLastCalledWith(
			error,
			expect.objectContaining({ fingerprint: ["specific-stripe-failure"] }),
		);
	});

	it("keeps non-Stripe webhook replay errors on their default grouping", () => {
		captureException.mockClear();
		const { logger } = createTestLogger();
		const error = new TypeError("Replay state is invalid");

		logger
			.child({
				context: { env: "live" },
				workflow: { name: "stripe-webhook-replay" },
			})
			.error({ error }, "failed");

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(captureException).toHaveBeenLastCalledWith(
			error,
			expect.not.objectContaining({ fingerprint: expect.anything() }),
		);
	});

	it("names background work by the log's type when there is no request or job", () => {
		captureException.mockClear();
		const { logger } = createTestLogger();

		logger.error(
			{
				error: new Error("deadline"),
				type: "balance_worker_evict_queue_failed",
			},
			"evict failed",
		);

		expect(captureException).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				tags: expect.objectContaining({
					operation: "balance_worker_evict_queue_failed",
				}),
			}),
		);
	});

	it("annotates the logged error with its kind and code inside the error field", () => {
		const { jobLogger, lines } = createTestLogger();

		jobLogger.error(
			{ error: new RecaseError({ message: "Not found", code: "not_found" }) },
			"track failed",
		);

		expect(lines[0].error).toMatchObject({
			kind: "expected",
			code: "not_found",
			name: "RecaseError",
			message: "Not found",
		});
	});

	it("does not send expected errors or anything below error level", () => {
		captureException.mockClear();
		const { jobLogger } = createTestLogger();

		jobLogger.error({ error: new RecaseError({ message: "Not found" }) }, "x");
		jobLogger.warn({ error: new TypeError("y") }, "y");
		jobLogger.warn("sync failed: z");

		expect(captureException).not.toHaveBeenCalled();
	});

	it("sends a text-only error line titled by its message and grouped by its call site", () => {
		captureEvent.mockClear();
		const { jobLogger, lines } = createTestLogger();

		jobLogger.error("sync failed: connection reset");

		const [event] = captureEvent.mock.calls[0] as unknown as [
			{
				message: string;
				level: string;
				fingerprint: string[];
				tags: Record<string, unknown>;
				exception: {
					values: { stacktrace: { frames: { function: string }[] } }[];
				};
			},
		];
		expect(event.message).toBe("sync failed: connection reset");
		expect(event.level).toBe("error");
		expect(event.fingerprint).toEqual([
			"logged-message",
			"/app/server/src/sync/syncBatching.ts:queueSyncJob",
		]);
		expect(
			event.exception.values[0].stacktrace.frames.map(
				(frame) => frame.function,
			),
		).toEqual(["queueSyncJob"]);
		expect(event.tags).toMatchObject({ error_kind: "bug", org_slug: "acme" });
		expect(lines[0].msg).toBe("sync failed: connection reset");
		expect(lines[0].error).toBeUndefined();
	});

	it("keeps anonymous text-only failures message-titled without grouping by dynamic text", () => {
		captureEvent.mockClear();
		captureException.mockClear();
		const { jobLogger, lines } = createTestLogger();
		const caller = {
			filename: "/app/server/src/sync/syncBatching.ts",
			function: "<anonymous>",
		};
		const messages = [
			"Balance flush failed for customer_123: deadlock detected",
			"Balance flush failed for customer_456: connection reset",
		];

		for (const message of messages) {
			stackParser.mockImplementationOnce(() => [
				caller,
				...loggedFrames.slice(1),
			]);
			jobLogger.error(message);

			expect(captureEvent).toHaveBeenLastCalledWith({
				message,
				level: "error",
				fingerprint: [
					"logged-message",
					"/app/server/src/sync/syncBatching.ts:<anonymous>",
				],
				exception: {
					values: [
						{
							type: "Error",
							value: message,
							stacktrace: { frames: [caller] },
							mechanism: { type: "logger", handled: true },
						},
					],
				},
				tags: expect.objectContaining({
					error_kind: "bug",
					service: "server",
					operation: "track",
					env: "live",
					org_id: "org_1",
				}),
				user: { id: "org_1", username: "acme" },
				contexts: expect.objectContaining({
					autumn: expect.objectContaining({ request_id: "job_1" }),
				}),
			});
		}

		expect(captureEvent).toHaveBeenCalledTimes(2);
		expect(captureException).not.toHaveBeenCalled();
		expect(lines.map((line) => line.msg)).toEqual(messages);
	});

	it("retains caller context on text-only invalidation errors with batch data", () => {
		captureEvent.mockClear();
		const { jobLogger, lines } = createTestLogger();

		jobLogger.error(
			{
				type: "batch_invalidate_full_subjects_dropped",
				data: { org_id: "org_1", env: "live", customer_count: 2 },
			},
			"FullSubject batch invalidation exhausted its attempts",
		);

		expect(captureEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				tags: expect.objectContaining({
					org_id: "org_1",
					org_slug: "acme",
					env: "live",
					operation: "track",
				}),
			}),
		);
		expect(lines[0].context).toEqual({
			org_id: "org_1",
			org_slug: "acme",
			env: "live",
		});
	});

	it.each([
		{
			errorType: "pending_plan_expiry_failed",
			bindings: {},
			operation: undefined,
		},
		{
			errorType: "subject_balance_flush_failed",
			bindings: { req: { route: "POST /webhooks/connect/:env" } },
			operation: "POST /webhooks/connect/:env",
		},
		{
			errorType: "batch_reset_barrier_wait_exceeded",
			bindings: {},
			operation: undefined,
		},
		{
			errorType: "subject_balance_flush_failed",
			bindings: { workflow: { name: "track" }, req: { route: "POST /track" } },
			operation: "track",
		},
		{
			errorType: "subject_balance_flush_failed",
			bindings: { type: "general_log_type" },
			operation: "general_log_type",
		},
	])(
		"keeps text-only grouping and operation unchanged when adding $errorType",
		({ errorType, bindings, operation }) => {
			captureEvent.mockClear();
			captureException.mockClear();
			const { logger } = createTestLogger();
			const sourceLogger = logger.child(bindings);
			const fingerprint = [
				"logged-message",
				"/app/server/src/sync/syncBatching.ts:queueSyncJob",
			];

			sourceLogger.error("Original failure for customer_123");
			const before = captureEvent.mock.calls[0][0];
			expect(before.fingerprint).toEqual(fingerprint);
			expect(before.tags?.operation).toBe(operation);
			expect(before.exception?.values?.[0].type).toBe("Error");

			for (const message of [
				"Failure for customer_123",
				"Failure for customer_456",
			]) {
				sourceLogger.error({ error_type: errorType }, message);
				const after = captureEvent.mock.calls.at(-1)?.[0];
				expect(after?.fingerprint).toEqual(before.fingerprint);
				expect(after?.tags).toEqual(before.tags);
				expect(after?.level).toBe(before.level);
				expect(after?.exception?.values?.[0]).toEqual({
					...before.exception?.values?.[0],
					type: errorType,
					value: message,
				});
			}

			expect(captureEvent).toHaveBeenCalledTimes(3);
			expect(captureException).not.toHaveBeenCalled();
		},
	);

	it("finds a bare Error passed as the first argument", () => {
		captureException.mockClear();
		const { jobLogger, lines } = createTestLogger();

		jobLogger.error(new TypeError("bare"));

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(lines[0].error).toMatchObject({ kind: "bug", message: "bare" });
	});

	it("keeps native exception identity when a log line has an error_type", () => {
		captureEvent.mockClear();
		captureException.mockClear();
		const { jobLogger } = createTestLogger();
		const error = new TypeError("original failure");

		jobLogger.error(
			{
				type: "general_log_type",
				error_type: "subject_balance_flush_failed",
				error,
			},
			"flush failed",
		);

		expect(captureEvent).not.toHaveBeenCalled();
		expect(captureException).toHaveBeenCalledWith(
			error,
			expect.objectContaining({
				tags: expect.objectContaining({
					error_kind: "bug",
					operation: "track",
				}),
			}),
		);
		expect(error.name).toBe("TypeError");
		expect(error.message).toBe("original failure");
	});

	it("logs the line even when Sentry throws", () => {
		captureException.mockImplementationOnce(() => {
			throw new Error("sentry down");
		});
		const { jobLogger, lines } = createTestLogger();

		expect(() =>
			jobLogger.error({ error: new TypeError("x") }, "track failed"),
		).not.toThrow();
		expect(lines).toHaveLength(1);
	});

	it("still logs but never captures when capture is switched off", () => {
		captureException.mockClear();
		const { jobLogger, lines } = createTestLogger({ captureToSentry: false });

		jobLogger.error({ error: new TypeError("x") }, "track failed");

		expect(lines).toHaveLength(1);
		expect(captureException).not.toHaveBeenCalled();
	});
});
