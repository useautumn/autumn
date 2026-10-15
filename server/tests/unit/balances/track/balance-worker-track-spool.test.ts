import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import { BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS } from "@autumn/env/balanceWorkerConstants";
import type { TrackParams } from "@autumn/shared";
import type { SQSClient } from "@aws-sdk/client-sqs";
import {
	KafkaJSConnectionError,
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
} from "kafkajs";
import { runBalanceWorkerAsyncTrack } from "@/internal/balances/track/balanceWorker/runBalanceWorkerAsyncTrack.js";
import * as claimKey from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import * as releaseKey from "@/internal/misc/idempotency/actions/releaseIdempotencyKey.js";
import { getSqsClient } from "@/queue/initSqs.js";
import { createCustomerFixture } from "../balanceWorker/customer-fixture.js";

const standardQueueUrl =
	"https://sqs.us-east-2.amazonaws.com/123456789012/track-spool-test-standard";
const previousStandardQueueUrl = process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = standardQueueUrl;

/** What SQS was handed, how often it was asked, and whether it takes the next send. */
const sqs = {
	messages: [] as { name: string; data: Record<string, unknown> }[],
	sends: 0,
	down: false,
};
const sqsClient = getSqsClient({ queueUrl: standardQueueUrl });
const originalSend = sqsClient.send.bind(sqsClient);
sqsClient.send = (async (command: { input: Record<string, unknown> }) => {
	sqs.sends++;
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
	if (previousStandardQueueUrl === undefined)
		delete process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL;
	else
		process.env.TRACK_ASYNC_STANDARD_SQS_QUEUE_URL = previousStandardQueueUrl;
});

/** What kafkajs throws once its own retries run out on a dropped broker connection (Oct 15). */
const connectionClosed = () =>
	new KafkaJSNumberOfRetriesExceeded(
		// kafkajs's typings omit KafkaJSConnectionClosedError; this is its shape.
		Object.assign(new KafkaJSConnectionError("Closed connection"), {
			name: "KafkaJSConnectionClosedError",
		}),
		{ retryCount: 3, retryTime: 900 },
	);

/** What kafkajs throws while a partition's leadership is moving. */
const notLeader = () =>
	new KafkaJSNumberOfRetriesExceeded(
		new KafkaJSProtocolError(
			Object.assign(
				new Error("This server is not the leader for that topic-partition"),
				{ type: "NOT_LEADER_FOR_PARTITION", code: 6, retriable: true },
			),
		),
		{ retryCount: 3, retryTime: 900 },
	);

/** A broker refusal no retry fixes. */
const messageTooLarge = () =>
	new KafkaJSProtocolError(
		Object.assign(
			new Error(
				"The request included a message larger than the max message size",
			),
			{ type: "MESSAGE_TOO_LARGE", code: 10, retriable: false },
		),
	);

type AttemptOutcome = "ack" | "hang" | Error;

/** A command log whose attempts the test scripts: ack, fail, or hang until released or out of time. */
function createAppend({
	outcomeOf,
}: {
	outcomeOf: (attempt: number) => AttemptOutcome;
}) {
	const attempts: { at: number; commands: TrackCommand[] }[] = [];
	const released = Promise.withResolvers<void>();
	const track = async ({
		commands,
		signal,
	}: {
		commands: readonly TrackCommand[];
		signal?: AbortSignal;
	}) => {
		attempts.push({ at: performance.now(), commands: [...commands] });
		const outcome = outcomeOf(attempts.length);
		if (outcome instanceof Error) throw outcome;
		if (outcome === "ack") return;
		await Promise.race([
			released.promise,
			new Promise((_, reject) =>
				signal?.addEventListener(
					"abort",
					() =>
						reject(
							new BalanceWorkerClientError({
								code: "DEADLINE",
								outcome: "unknown",
								message: "Worker request deadline exceeded",
							}),
						),
					{ once: true },
				),
			),
		]);
	};
	const client = {
		queue: {
			track,
			reset: async () => undefined,
			updateBalance: async () => undefined,
			evict: async () => undefined,
			finalize: async () => undefined,
		},
	};
	return { client, attempts, land: () => released.resolve() };
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

describe("runBalanceWorkerAsyncTrack: Kafka retried, SQS once the hedge passes", () => {
	let spies: ReturnType<typeof spyOnClaims>;
	beforeEach(() => {
		sqs.messages = [];
		sqs.sends = 0;
		sqs.down = false;
		spies?.restore();
		spies = spyOnClaims();
	});
	afterAll(() => spies?.restore());

	test("an acked append spools nothing and keeps the claim", async () => {
		const { ctx, body } = fixture();
		const append = createAppend({ outcomeOf: () => "ack" });
		await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
		expect(append.attempts).toHaveLength(1);
		expect(sqs.sends).toBe(0);
		expect(spies.claims).toEqual(["track:k1"]);
		expect(spies.releases).toEqual([]);
	});

	test("a dropped broker connection is retried and lands on Kafka without touching SQS", async () => {
		const { ctx, body } = fixture();
		const append = createAppend({
			outcomeOf: (attempt) => (attempt === 1 ? connectionClosed() : "ack"),
		});
		await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
		expect(append.attempts).toHaveLength(2);
		expect(append.attempts[1]?.commands).toEqual(append.attempts[0]?.commands);
		expect(sqs.sends).toBe(0);
		expect(spies.releases).toEqual([]);
	});

	test("with SQS down, Kafka is retried through a leader move past the hedge and the track lands", async () => {
		const { ctx, body } = fixture();
		sqs.down = true;
		const startedAt = performance.now();
		const append = createAppend({
			outcomeOf: () =>
				performance.now() - startedAt <
				BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS + 200
					? notLeader()
					: "ack",
		});
		await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
		expect(append.attempts.length).toBeGreaterThan(2);
		expect(sqs.sends).toBe(1);
		expect(sqs.messages).toEqual([]);
		expect(spies.releases).toEqual([]);
	});

	test(
		"with SQS down, a 503 comes only once Kafka is still failing at the deadline, and the claim is released",
		async () => {
			const { ctx, body } = fixture();
			sqs.down = true;
			const startedAt = performance.now();
			const append = createAppend({ outcomeOf: () => notLeader() });
			await expect(
				runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
			).rejects.toMatchObject({
				statusCode: 503,
				code: "balance_worker_result_unknown",
			});
			expect(performance.now() - startedAt).toBeGreaterThan(2_500);
			expect(append.attempts.length).toBeGreaterThan(5);
			expect(spies.releases).toEqual(["track:k1"]);
		},
		{ timeout: 10_000 },
	);

	test("a refusal no retry fixes is spooled at once under the append's request id and timestamp", async () => {
		const { ctx, body } = fixture();
		const tokens = {
			usage: { modelName: "m", inputTokens: 1, outputTokens: 2 },
			cost: 3,
		};
		const startedAt = performance.now();
		const append = createAppend({ outcomeOf: () => messageTooLarge() });
		await runBalanceWorkerAsyncTrack({
			ctx,
			body,
			tokens,
			client: append.client,
		});
		expect(performance.now() - startedAt).toBeLessThan(
			BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS,
		);
		expect(append.attempts).toHaveLength(1);
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
	});

	test("an append still unacked at the hedge is spooled and answered without waiting for it", async () => {
		const { ctx, body } = fixture();
		const append = createAppend({ outcomeOf: () => "hang" });
		await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
		expect(sqs.messages).toHaveLength(1);
		expect(sqs.messages[0]?.data.requestId).toBe(ctx.id);
		expect(spies.releases).toEqual([]);
		append.land();
	});

	test("Kafka retries stop once SQS holds the track", async () => {
		const { ctx, body } = fixture();
		const append = createAppend({ outcomeOf: () => connectionClosed() });
		await runBalanceWorkerAsyncTrack({ ctx, body, client: append.client });
		const attemptsWhenAccepted = append.attempts.length;
		await Bun.sleep(600);
		expect(sqs.messages).toHaveLength(1);
		expect(append.attempts.length).toBeLessThanOrEqual(
			attemptsWhenAccepted + 1,
		);
	});

	test("a slow append whose spool fails still accepts the track once the append acks", async () => {
		const { ctx, body } = fixture();
		sqs.down = true;
		const append = createAppend({ outcomeOf: () => "hang" });
		const accepted = runBalanceWorkerAsyncTrack({
			ctx,
			body,
			client: append.client,
		});
		await Bun.sleep(BALANCE_WORKER_TRACK_SPOOL_HEDGE_MS + 150);
		append.land();
		await accepted;
		expect(sqs.sends).toBe(1);
		expect(spies.releases).toEqual([]);
	});

	test("a refusal and an unreachable SQS answer 503, never 500, and release the claim", async () => {
		const { ctx, body } = fixture();
		sqs.down = true;
		const append = createAppend({ outcomeOf: () => messageTooLarge() });
		await expect(
			runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
		).rejects.toMatchObject({
			statusCode: 503,
			code: "balance_worker_result_unknown",
		});
		expect(spies.releases).toEqual(["track:k1"]);
	});

	test("a client-coded append failure keeps its own 503 code when SQS also fails", async () => {
		const { ctx, body } = fixture();
		sqs.down = true;
		const append = createAppend({
			outcomeOf: () =>
				new BalanceWorkerClientError({
					code: "COMMAND_LOG_UNAVAILABLE",
					outcome: "not_submitted",
					message: "kafka away",
				}),
		});
		await expect(
			runBalanceWorkerAsyncTrack({ ctx, body, client: append.client }),
		).rejects.toMatchObject({
			statusCode: 503,
			code: "balance_worker_unavailable",
		});
		expect(append.attempts).toHaveLength(1);
	});
});
