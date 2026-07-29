import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersionClass, LATEST_VERSION, RecaseError } from "@autumn/shared";

// Capture real modules BEFORE mocking — mock.module leaks across test files
// (mock.restore does not undo it), so afterAll re-mocks with the real exports.
const realRedisV2Availability = {
	...(await import("@/external/redis/initUtils/redisV2Availability.js")),
};
const realRunCheckV2 = {
	...(await import("@/internal/balances/check/runCheckV2.js")),
};
const realRunTrackV3 = {
	...(await import("@/internal/balances/track/v3/runTrackV3.js")),
};
const realQueueUtils = { ...(await import("@/queue/queueUtils.js")) };

mock.module("@/external/redis/initUtils/redisV2Availability.js", () => ({
	shouldUseRedisV2: () => true,
}));

const gateRejection = () =>
	new RecaseError({
		message: "Too many concurrent requests for this customer.",
		code: "rate_limit_exceeded",
		statusCode: 429,
		data: { reason: "per_customer_queue_full" },
	});

mock.module("@/internal/balances/check/runCheckV2.js", () => ({
	runCheckV2: async ({ ctx }: { ctx?: { id?: string } } = {}) => {
		if (ctx?.id !== "req_test_gate_failopen") {
			return {
				checkData: { source: "v2" },
				response: { allowed: true, source: "v2" },
			};
		}
		throw checkError;
	},
}));

mock.module("@/internal/balances/track/v3/runTrackV3.js", () => ({
	runTrackV3: async () => {
		throw trackError;
	},
}));

const queueCalls: Record<string, unknown>[] = [];
mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: Record<string, unknown>) => {
		queueCalls.push(args);
		const queueUrl = args.queueUrl ?? process.env.SQS_QUEUE_URL_V2;
		if (!queueUrl) return;
		if (
			typeof queueUrl === "string" &&
			queueUrl.startsWith("https://sqs.test")
		) {
			return;
		}

		const { getSqsClient } = await import("@/queue/initSqs.js");
		const sqsClient = getSqsClient({ queueUrl: queueUrl as string });
		await sqsClient.send({
			input: {
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify({
					name: args.jobName,
					data: args.payload,
				}),
				...(args.messageGroupId ? { MessageGroupId: args.messageGroupId } : {}),
				...(args.messageDeduplicationId
					? { MessageDeduplicationId: args.messageDeduplicationId }
					: {}),
			},
		} as never);
	},
}));

let checkError: unknown = gateRejection();
let trackError: unknown = gateRejection();

const { withRedisFailOpen } = await import(
	"@/external/redis/utils/withRedisFailOpen.js"
);
const { isFullSubjectGateRejection } = await import(
	"@/internal/customers/repos/getFullSubject/getFullSubjectGate.js"
);
const { runCheckWithRollout } = await import(
	"@/internal/balances/check/runCheckWithRollout.js"
);
const { runTrackWithRollout } = await import(
	"@/internal/balances/track/runTrackWithRollout.js"
);
const { ParsedCheckParamsSchema } = await import("@autumn/shared");

const originalTrackQueueUrl = process.env.TRACK_SQS_QUEUE_URL;
process.env.TRACK_SQS_QUEUE_URL = "https://sqs.test/queue";

afterAll(() => {
	process.env.TRACK_SQS_QUEUE_URL = originalTrackQueueUrl;
	mock.module(
		"@/external/redis/initUtils/redisV2Availability.js",
		() => realRedisV2Availability,
	);
	mock.module("@/internal/balances/check/runCheckV2.js", () => realRunCheckV2);
	mock.module(
		"@/internal/balances/track/v3/runTrackV3.js",
		() => realRunTrackV3,
	);
	mock.module("@/queue/queueUtils.js", () => realQueueUtils);
});

const noopLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

const makeContext = () =>
	({
		id: "req_test_gate_failopen",
		org: { id: "org_test", slug: "test-org" },
		env: "live",
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		logger: noopLogger,
		extraLogs: {},
		features: [],
		rolloutSnapshot: {
			rolloutId: "v2-cache",
			enabled: true,
			percent: 100,
			previousPercent: 100,
			changedAt: 0,
			customerBucket: 0,
		},
		// biome-ignore lint/suspicious/noExplicitAny: minimal test context
	}) as any;

const checkBody = ParsedCheckParamsSchema.parse({
	customer_id: "cus_gate_failopen",
	feature_id: "messages",
});

describe("withRedisFailOpen alsoFailOpen", () => {
	test("gate rejection falls open when alsoFailOpen matches", async () => {
		const rejection = gateRejection();
		let receivedError: unknown;
		const result = await withRedisFailOpen<string>({
			source: "test",
			run: () => {
				throw rejection;
			},
			alsoFailOpen: isFullSubjectGateRejection,
			fallback: (error) => {
				receivedError = error;
				return "fallback";
			},
		});
		expect(result).toBe("fallback");
		expect(receivedError).toBe(rejection);
	});

	test("gate rejection still propagates without alsoFailOpen", async () => {
		await expect(
			withRedisFailOpen<string>({
				source: "test",
				run: () => {
					throw gateRejection();
				},
				fallback: () => "fallback",
			}),
		).rejects.toMatchObject({ code: "rate_limit_exceeded", statusCode: 429 });
	});

	test("non-matching errors propagate even with alsoFailOpen", async () => {
		await expect(
			withRedisFailOpen<string>({
				source: "test",
				run: () => {
					throw new Error("boom");
				},
				alsoFailOpen: isFullSubjectGateRejection,
				fallback: () => "fallback",
			}),
		).rejects.toThrow("boom");
	});

	test("transient db errors still fall open without alsoFailOpen", async () => {
		const result = await withRedisFailOpen<string>({
			source: "test",
			run: () => {
				const error = new Error("too many connections") as Error & {
					code: string;
				};
				error.code = "53300";
				throw error;
			},
			fallback: () => "fallback",
		});
		expect(result).toBe("fallback");
	});
});

describe("check flow on gate rejection", () => {
	beforeEach(() => {
		checkError = gateRejection();
	});

	test("returns the fail-open allow response instead of throwing", async () => {
		const result = await runCheckWithRollout({
			ctx: makeContext(),
			body: checkBody,
			requiredBalance: 1,
		});
		expect(result.checkData).toBeNull();
		expect(result.response).toMatchObject({ allowed: true });
	});

	test("non-gate errors still propagate", async () => {
		checkError = new Error("genuine bug");
		await expect(
			runCheckWithRollout({
				ctx: makeContext(),
				body: checkBody,
				requiredBalance: 1,
			}),
		).rejects.toThrow("genuine bug");
	});
});

describe("track flow on gate rejection", () => {
	beforeEach(() => {
		trackError = gateRejection();
		queueCalls.length = 0;
	});

	test("queues the event and returns the queued response", async () => {
		const ctx = makeContext();
		const result = await runTrackWithRollout({
			ctx,
			body: { customer_id: "cus_gate_failopen", feature_id: "messages" },
			featureDeductions: [],
		});
		expect(result).toMatchObject({
			customer_id: "cus_gate_failopen",
			balance: null,
		});
		expect(queueCalls.length).toBe(1);
		expect(queueCalls[0]?.messageDeduplicationId).toBe(ctx.id);
	});

	test("non-gate errors still propagate", async () => {
		trackError = new Error("genuine bug");
		await expect(
			runTrackWithRollout({
				ctx: makeContext(),
				body: { customer_id: "cus_gate_failopen", feature_id: "messages" },
				featureDeductions: [],
			}),
		).rejects.toThrow("genuine bug");
		expect(queueCalls.length).toBe(0);
	});
});
