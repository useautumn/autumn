import { afterEach, describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { PARTITION_RECOVERY_REASON } from "@autumn/balance-worker-client/protocol";
import { createBalanceWorkerApp } from "../../../../src/http/createBalanceWorkerApp.js";
import { workerErrorOf } from "../../../../src/http/handlers/errorHandler/workerErrorOf.js";
import {
	createInlineHandler,
	INLINE_ROUTES,
} from "../../../../src/http/handlers/inline/createInlineHandler.js";
import { heldFailureOf } from "../../../../src/http/handlers/inline/heldFailureOf.js";
import { createHttpWorkerPool } from "../../../../src/http/workerThreads/createHttpWorkerPool.js";
import type { HttpWorkerListener } from "../../../../src/http/workerThreads/types/httpWorkerPool.js";
import { connectHeldReplies } from "../../../../src/init/construction/connectHeldReplies.js";
import {
	MutationBatchNotCommittedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../../src/processor/writer/writerErrors.js";
import {
	identity,
	partition,
	residentFixture,
	trackCommand,
	waitForAppend,
} from "../../../fixtures/heldTrack.js";

const route = { partition, routeEpoch: "7" };
const logger = { debug() {}, info() {}, warn() {}, error() {} };
const noFatal = ({ cause }: { cause: unknown }) => {
	throw new Error(`unexpected pool failure: ${String(cause)}`);
};

type Worker = Awaited<ReturnType<typeof residentFixture>>;

async function freePort(): Promise<number> {
	const reservation = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = reservation.port;
	await reservation.stop(true);
	if (port === undefined) throw new Error("no port");
	return port;
}

/** The worker's HTTP path through real threads: inline routes when `inline`, otherwise only the ordinary app. */
async function serve({
	worker,
	inline,
}: {
	worker: Worker;
	inline: boolean;
}): Promise<{
	post(command: TrackCommand): Promise<{ status: number; body: unknown }>;
	postBatch(
		commands: TrackCommand[],
	): Promise<{ status: number; text: string }>;
	stop(): Promise<void>;
}> {
	const runtime = {
		process: <Decision>(
			run: (processor: Worker["processor"]) => Promise<Decision>,
		) => run(worker.processor),
		processInline: <Decision>(
			run: (processor: Worker["processor"]) => Decision | null,
		) => run(worker.processor),
	};
	const ctx = {
		ownership: { findRuntime: () => runtime },
		partitionResolver: { partitionForIdentity: () => partition },
		logger,
	};
	const port = await freePort();
	const listener: HttpWorkerListener = await createHttpWorkerPool({
		ctx: {
			fetch: createBalanceWorkerApp({ ctx }).fetch,
			logger,
			onFatal: noFatal,
		},
		config: {
			hostname: "127.0.0.1",
			port,
			maxRequestBodySize: 1 << 20,
			threads: 1,
			requestRingBytes: 4 << 20,
			replyRingBytes: 16 << 20,
			...(inline && {
				inline: {
					routes: INLINE_ROUTES,
					handler: createInlineHandler({ ctx }),
					commitCells: worker.positions.cells,
					failureCounts: worker.positions.failureCounts,
				},
			}),
		},
	}).listen();
	// Only a pool with inline routes holds replies, as in the worker's wiring.
	const disconnect = inline
		? connectHeldReplies({
				positions: worker.positions,
				http: listener,
				renderFailure: heldFailureOf,
			})
		: () => {};
	async function send(path: string, body: object) {
		const response = await fetch(`http://127.0.0.1:${port}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		return { status: response.status, body: await response.json() };
	}
	function post(command: TrackCommand) {
		return send("/v1/track", { route, command });
	}
	async function postBatch(commands: TrackCommand[]) {
		const response = await fetch(`http://127.0.0.1:${port}/v1/track-batch`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ route, commands }),
		});
		return { status: response.status, text: await response.text() };
	}
	async function stop(): Promise<void> {
		await listener.stop();
		disconnect();
	}
	return { post, postBatch, stop };
}

async function pendingFor<T>(promise: Promise<T>, ms: number) {
	return Promise.race([promise, Bun.sleep(ms).then(() => "pending" as const)]);
}

/** Releases appends as they arrive until `answer` settles, refusing the `failAppend`-th (0-based). */
async function answerReleasing<T>({
	worker,
	answer,
	failAppend,
}: {
	worker: Worker;
	answer: Promise<T>;
	failAppend?: number;
}): Promise<T> {
	let appends = 0;
	for (;;) {
		const settled = await pendingFor(answer, 20);
		if (settled !== "pending") return settled;
		try {
			worker.appender.release(
				appends === failAppend
					? {
							fail: new MutationBatchNotCommittedError({
								cause: new Error("no"),
							}),
						}
					: undefined,
			);
			appends++;
		} catch {}
	}
}

/** About 390 kB of batch body, under the inline cap: logged, it passes the writer's 800 kB append budget. */
function bigBatch(prefix: string): TrackCommand[] {
	return Array.from({ length: 90 }, (_, index) => ({
		...trackCommand({ commandId: `${prefix}_${index}` }),
		properties: { pad: "x".repeat(3_700) },
	}));
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Counts the tracks the processor decided inline, so a test knows which path answered. */
async function setUp({ inline }: { inline: boolean }) {
	const worker = await residentFixture();
	cleanups.push(() => worker.close());
	const decideInline = worker.processor.trackInline;
	const counts = { inlined: 0, batchesInlined: 0 };
	const decideBatchInline = worker.processor.trackBatchInline;
	worker.processor.trackBatchInline = (params) => {
		const outcome = decideBatchInline(params);
		if (outcome.kind === "decided") counts.batchesInlined++;
		return outcome;
	};
	worker.processor.trackInline = (params) => {
		const outcome = decideInline(params);
		if (outcome) counts.inlined++;
		return outcome;
	};
	const http = await serve({ worker, inline });
	cleanups.push(() => http.stop());
	return { worker, http, counts };
}

describe("inline track end to end, through HTTP worker threads", () => {
	test("the client's answer is held until the log has the write, and is the ordinary route's answer byte for byte", async () => {
		const inline = await setUp({ inline: true });
		const ordinary = await setUp({ inline: false });
		const command = trackCommand({ commandId: "e2e", value: 3 });

		const held = inline.http.post(command);
		await waitForAppend();
		expect(await pendingFor(held, 100)).toBe("pending");
		expect(inline.worker.appender.batches).toEqual([1]);
		inline.worker.appender.release();

		const answered = ordinary.http.post(command);
		await Bun.sleep(50);
		ordinary.worker.appender.release();
		const [inlineAnswer, ordinaryAnswer] = await Promise.all([held, answered]);
		expect(inlineAnswer.status).toBe(200);
		expect(inlineAnswer).toEqual(ordinaryAnswer);
		expect([inline.counts.inlined, ordinary.counts.inlined]).toEqual([1, 0]);
	});

	test("a track batch is held as one write group and answers exactly what the ordinary batch route answers", async () => {
		const inline = await setUp({ inline: true });
		const ordinary = await setUp({ inline: false });
		const commands = [
			trackCommand({ commandId: "batch_1", value: 1 }),
			trackCommand({ commandId: "batch_1", value: 2 }),
			trackCommand({ commandId: "batch_2", value: 3 }),
		];
		const held = inline.http.postBatch(commands);
		await waitForAppend();
		expect(await pendingFor(held, 100)).toBe("pending");
		inline.worker.appender.release();
		const answered = ordinary.http.postBatch(commands);
		await Bun.sleep(50);
		ordinary.worker.appender.release();
		const [inlineAnswer, ordinaryAnswer] = await Promise.all([held, answered]);
		expect(inlineAnswer.status).toBe(200);
		expect(inlineAnswer).toEqual(ordinaryAnswer);
		expect([
			inline.counts.batchesInlined,
			ordinary.counts.batchesInlined,
		]).toEqual([1, 0]);
	});

	test("a ~400 kB batch takes more than one append and answers byte for byte what the ordinary batch route answers", async () => {
		const inline = await setUp({ inline: true });
		const ordinary = await setUp({ inline: false });
		const commands = bigBatch("big");
		const warmed = inline.worker.appender.batches.length;
		const inlineAnswer = await answerReleasing({
			worker: inline.worker,
			answer: inline.http.postBatch(commands),
		});
		const ordinaryAnswer = await answerReleasing({
			worker: ordinary.worker,
			answer: ordinary.http.postBatch(commands),
		});
		expect(inline.counts.batchesInlined).toBe(1);
		expect(inline.worker.appender.batches.length - warmed).toBeGreaterThan(1);
		expect(inlineAnswer.status).toBe(200);
		expect(inlineAnswer.text).toBe(ordinaryAnswer.text);
	});

	test("a refused second append fails only its commands, as the ordinary batch route does", async () => {
		const inline = await setUp({ inline: true });
		const ordinary = await setUp({ inline: false });
		const commands = bigBatch("half");
		const warmed = inline.worker.appender.batches.length;
		const inlineAnswer = await answerReleasing({
			worker: inline.worker,
			answer: inline.http.postBatch(commands),
			failAppend: 1,
		});
		const ordinaryAnswer = await answerReleasing({
			worker: ordinary.worker,
			answer: ordinary.http.postBatch(commands),
			failAppend: 1,
		});
		const landed = inline.worker.appender.batches[warmed] ?? 0;
		const { results } = JSON.parse(inlineAnswer.text) as {
			results: { ok: boolean }[];
		};
		expect(landed).toBeGreaterThan(0);
		expect(results.map(({ ok }) => ok)).toEqual(
			commands.map((_, index) => index < landed),
		);
		expect(inlineAnswer.text).toBe(ordinaryAnswer.text);
	});

	test("a retry after a partly refused batch applies each command once", async () => {
		const { worker, http } = await setUp({ inline: true });
		const commands = bigBatch("again");
		await answerReleasing({
			worker,
			answer: http.postBatch(commands),
			failAppend: 1,
		});
		const retried = await answerReleasing({
			worker,
			answer: http.postBatch(commands),
		});
		const { results } = JSON.parse(retried.text) as {
			results: { ok: boolean }[];
		};
		expect(results.every(({ ok }) => ok)).toBe(true);
		await worker.processor.drain();
		const balance = worker.store
			.readState({ identity })
			?.customerEntitlements.find(
				(row) => row.id === "messages_monthly",
			)?.balance;
		expect(balance).toBe(100 - 1 - commands.length);
	});

	test("a customer that needs the asynchronous ensure is answered through the ordinary route", async () => {
		const { worker, http, counts } = await setUp({ inline: true });
		const answer = http.post(
			trackCommand({
				commandId: "cold",
				who: {
					orgId: "org_1",
					env: "sandbox",
					customerId: "cus_cold",
					entityId: null,
				},
			}),
		);
		expect(await answer).toMatchObject({ status: 404 });
		expect(worker.appender.batches).toEqual([1]);
		expect(counts.inlined).toBe(0);
	});

	test("a refused append reaches the held client as a retryable 503 NOT_READY, never a 500", async () => {
		const { worker, http } = await setUp({ inline: true });
		const held = http.post(trackCommand({ commandId: "refused" }));
		await Bun.sleep(50);
		worker.appender.release({
			fail: new MutationBatchNotCommittedError({ cause: new Error("no") }),
		});
		expect(await held).toEqual({
			status: 503,
			body: {
				error: {
					code: "NOT_READY",
					message:
						"The write did not reach the log; nothing was applied, retry",
				},
			},
		});
	});

	test("an append whose outcome is unknown reaches the held client exactly as the ordinary route answers that cause", async () => {
		const { worker, http } = await setUp({ inline: true });
		const held = http.post(trackCommand({ commandId: "unknown" }));
		await Bun.sleep(50);
		worker.appender.release({ fail: new Error("acknowledgement lost") });
		const { status, error } = workerErrorOf({
			cause: new PartitionWriterRecoveryRequiredError({
				cause: new Error("acknowledgement lost"),
			}),
		});
		expect(status).toBe(500);
		expect(error.reason).toBe(PARTITION_RECOVERY_REASON);
		expect(await held).toEqual({ status, body: { error } });
	});

	test("shutdown in the worker's order: the writer's disposal answers held clients, then the HTTP threads stop without waiting on them", async () => {
		const { worker, http } = await setUp({ inline: true });
		const held = http.post(trackCommand({ commandId: "in-flight" }));
		await Bun.sleep(50);
		expect(await pendingFor(held, 50)).toBe("pending");
		worker.processor.dispose();
		expect(await held).toMatchObject({
			status: 500,
			body: {
				error: { code: "INTERNAL", reason: PARTITION_RECOVERY_REASON },
			},
		});
		expect(await pendingFor(http.stop(), 2_000)).toBeUndefined();
		cleanups.pop();
	});
});
