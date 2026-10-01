import { describe, expect, it, mock } from "bun:test";
import { Writable } from "node:stream";

const captureException = mock(() => "event_123");
const captureEvent = mock(() => "event_456");
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
mock.module("@sentry/bun", () => ({
	captureException,
	captureEvent,
	getClient: () => ({
		getOptions: () => ({ stackParser: () => loggedFrames }),
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

	it("finds a bare Error passed as the first argument", () => {
		captureException.mockClear();
		const { jobLogger, lines } = createTestLogger();

		jobLogger.error(new TypeError("bare"));

		expect(captureException).toHaveBeenCalledTimes(1);
		expect(lines[0].error).toMatchObject({ kind: "bug", message: "bare" });
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
