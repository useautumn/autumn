import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import type { TrackParams } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { runBalanceWorkerAsyncTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

const standardQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-spool-test-standard";
const previousEnv = {
	spool: process.env.BALANCE_WORKER_TRACK_SPOOL_ENABLED,
	hedge: process.env.BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS,
	standard: process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL,
};
process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = standardQueueUrl;
process.env.BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS = "50";

const restoreEnv = (key: string, value: string | undefined) => {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
};

/** What SQS was handed, and whether it takes the next send. */
const sqs = {
	messages: [] as { name: string; data: Record<string, unknown> }[],
	down: false,
};
const sqsClient = getSqsClient({ queueUrl: standardQueueUrl });
const originalSend = sqsClient.send.bind(sqsClient);
sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
	if (sqs.down) throw new Error("SQS is unreachable");
	const entries = command.input.Entries as {
		Id: string;
		MessageBody: string;
	}[];
	for (const entry of entries) sqs.messages.push(JSON.parse(entry.MessageBody));
	return { Successful: entries.map(({ Id }) => ({ Id })) };
}) as SQSClient["send"];

afterAll(() => {
	sqsClient.send = originalSend;
	restoreEnv("BALANCE_WORKER_TRACK_SPOOL_ENABLED", previousEnv.spool);
	restoreEnv("BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS", previousEnv.hedge);
	restoreEnv("TRACK_ASYNC_STANDARD_SQS_QUEUE_URL", previousEnv.standard);
});

/** The raw error kafkajs threw on Oct 15, which today escapes as a 500. */
const kafkaConnectionClosed = Object.assign(new Error("Closed connection"), {
	name: "KafkaJSNumberOfRetriesExceeded",
});

/** An append whose outcome the test decides: ack, fail, or hang until released. */
function createAppend() {
	const appended: TrackCommand[][] = [];
	let behaviour: "ack" | "fail" | "hang" = "ack";
	let failure: Error = kafkaConnectionClosed;
	const pending = Promise.withResolvers<void>();
	const client = {
		queue: {
			track: async ({ commands }: { commands: readonly TrackCommand[] }) => {
				appended.push([...commands]);
				if (behaviour === "fail") throw failure;
				if (behaviour === "hang") await pending.promise;
			},
			reset: async () => undefined,
			updateBalance: async () => undefined,
			evict: async () => undefined,
			finalize: async () => undefined,
		},
	};
	return {
		client,
		appended,
		ack: () => {
			behaviour = "ack";
		},
		fail: (error: Error = kafkaConnectionClosed) => {
			behaviour = "fail";
			failure = error;
		},
		hang: () => {
			behaviour = "hang";
		},
		landLate: () => pending.resolve(),
		failLate: () => pending.reject(kafkaConnectionClosed),
	};
}

function spyOnClaims() {
	const claims: string[] = [];
	const releases: string[] = [];
	const claimSpy = spyOn(claimKey, "checkIdempotencyKey").mockImplementation(
		async ({ idempotencyKey }) => {
			claims.push(idempotencyKey);
		},
	);
	const releaseSpy = spyOn(
		releaseKey,
		"releaseIdempotencyKey",
	).mockImplementation(async ({ idempotencyKey }) => {
		releases.push(idempotencyKey);
	});
	return {
		claims,
		releases,
		restore: () => {
			claimSpy.mockRestore();
			releaseSpy.mockRestore();
		},
	};
}

function fixture() {
	const { ctx, fullSubject } = createCustomerFixture();
	const body: TrackParams = {
		customer_id: fullSubject.customerId,
		feature_id: "messages",
		value: 3,
		idempotency_key: "k1",
	};
	return { ctx, body };
}

describe("runBalanceWorkerAsyncTrack with the SQS spool on", () => {
	beforeEach(() => {
		process.env.BALANCE_WORKER_TRACK_SPOOL_ENABLED = "true";
		sqs.messages = [];
		sqs.down = false;
	});

	test("an acked append spools nothing and keeps the claim", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
			expect(append.appended).toHaveLength(1);
			expect(sqs.messages).toEqual([]);
			expect(spies.claims).toEqual(["track:k1"]);
			expect(spies.releases).toEqual([]);
		} finally {
			spies.restore();
		}
	});

	test("a raw Kafka failure is spooled under the append's request id and timestamp, and the claim is kept", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.fail();
			const tokens = {
				usage: { modelName: "m", inputTokens: 1, outputTokens: 2 },
				cost: 3,
			};
			await runBalanceWorkerAsyncTrack({
				ctx,
				body,
				tokens,
				client: append.client,
			});
			expect(sqs.messages).toHaveLength(1);
			expect(sqs.messages[0]).toMatchObject({
				name: "track",
				data: {
					orgId: ctx.org.id,
					env: ctx.env,
					customerId: body.customer_id,
					requestId: ctx.id,
					body: { ...body, timestamp: ctx.timestamp },
					tokens,
					validateTrackBodyIdempotencyKey: false,
					spooledAt: expect.any(Number),
				},
			});
			expect(spies.releases).toEqual([]);
		} finally {
			spies.restore();
		}
	});

	test("an append still unacked at the hedge is spooled and answered without waiting for it", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.hang();
			await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
			expect(sqs.messages).toHaveLength(1);
			expect(sqs.messages[0]?.data.requestId).toBe(ctx.id);
			expect(spies.releases).toEqual([]);
			append.landLate();
		} finally {
			spies.restore();
		}
	});

	test("an append and a spool that both fail answer 503, never 500, and release the claim", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.fail();
			sqs.down = true;
			await expect(
				runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
			).rejects.toMatchObject({
				statusCode: 503,
				code: "balance_worker_result_unknown",
			});
			expect(spies.releases).toEqual(["track:k1"]);
		} finally {
			spies.restore();
		}
	});

	test("a slow append whose spool fails still accepts the track once the append acks", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.hang();
			sqs.down = true;
			const accepted = runBalanceWorkerAsyncTrack({
				ctx,
				body,
				client: append.client,
			});
			await Bun.sleep(120);
			append.landLate();
			await accepted;
			expect(spies.releases).toEqual([]);
		} finally {
			spies.restore();
		}
	});

	test("a slow append that fails after its spool failed is a 503", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.hang();
			sqs.down = true;
			const accepted = runBalanceWorkerAsyncTrack({
				ctx,
				body,
				client: append.client,
			});
			await Bun.sleep(120);
			append.failLate();
			await expect(accepted).rejects.toMatchObject({ statusCode: 503 });
			expect(spies.releases).toEqual(["track:k1"]);
		} finally {
			spies.restore();
		}
	});

	test("a client-coded append failure keeps its own 503 code when the spool also fails", async () => {
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.fail(
				new BalanceWorkerClientError({
					code: "COMMAND_LOG_UNAVAILABLE",
					outcome: "not_submitted",
					message: "kafka away",
				}),
			);
			sqs.down = true;
			await expect(
				runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
			).rejects.toMatchObject({
				statusCode: 503,
				code: "balance_worker_unavailable",
			});
		} finally {
			spies.restore();
		}
	});
});

describe("runBalanceWorkerAsyncTrack with the SQS spool off", () => {
	test("a failed append neither spools nor changes how it surfaces", async () => {
		delete process.env.BALANCE_WORKER_TRACK_SPOOL_ENABLED;
		sqs.messages = [];
		const spies = spyOnClaims();
		try {
			const { ctx, body } = fixture();
			const append = createAppend();
			append.fail();
			await expect(
				runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
			).rejects.toBe(kafkaConnectionClosed);
			expect(sqs.messages).toEqual([]);
		} finally {
			spies.restore();
		}
	});
});
