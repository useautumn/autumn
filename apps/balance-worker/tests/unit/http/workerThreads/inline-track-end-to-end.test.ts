import { afterEach, describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { createBalanceWorkerApp } from "../../../../src/http/createBalanceWorkerApp.js";
import {
	createInlineHandler,
	INLINE_ROUTES,
} from "../../../../src/http/handlers/inline/createInlineHandler.js";
import { heldFailureOf } from "../../../../src/http/handlers/inline/heldFailureOf.js";
import { createHttpWorkerPool } from "../../../../src/http/workerThreads/createHttpWorkerPool.js";
import type { HttpWorkerListener } from "../../../../src/http/workerThreads/types/httpWorkerPool.js";
import { connectHeldReplies } from "../../../../src/init/construction/connectHeldReplies.js";
import { MutationBatchNotCommittedError } from "../../../../src/processor/writer/writerErrors.js";
import {
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
			requestRingBytes: 1 << 16,
			replyRingBytes: 1 << 16,
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
	const disconnect = connectHeldReplies({
		positions: worker.positions,
		http: listener,
		renderFailure: heldFailureOf,
	});
	async function post(command: TrackCommand) {
		const response = await fetch(`http://127.0.0.1:${port}/v1/track`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ route, command }),
		});
		return { status: response.status, body: await response.json() };
	}
	async function stop(): Promise<void> {
		await listener.stop();
		disconnect();
	}
	return { post, stop };
}

async function pendingFor<T>(promise: Promise<T>, ms: number) {
	return Promise.race([promise, Bun.sleep(ms).then(() => "pending" as const)]);
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
	const counts = { inlined: 0 };
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

	test("shutdown in the worker's order: the writer's disposal answers held clients, then the HTTP threads stop without waiting on them", async () => {
		const { worker, http } = await setUp({ inline: true });
		const held = http.post(trackCommand({ commandId: "in-flight" }));
		await Bun.sleep(50);
		expect(await pendingFor(held, 50)).toBe("pending");
		worker.processor.dispose();
		expect(await held).toMatchObject({
			status: 503,
			body: { error: { code: "NOT_READY" } },
		});
		expect(await pendingFor(http.stop(), 2_000)).toBeUndefined();
		cleanups.pop();
	});
});
