/**
 * Serial-decide arm D end to end: real I/O workers, the real hot decider, the real writer and position board,
 * with only the log replaced by an appender a test releases by hand. What a client sees when an append is
 * refused, when the owner goes away mid-flight, and when a rebuilt owner takes the customer back.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PARTITION_RECOVERY_REASON } from "@autumn/balance-worker-client/protocol";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import { createBalanceWorkerFetch } from "../../../src/http/fastPath/createBalanceWorkerFetch.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerRequestContext,
} from "../../../src/http/types/balanceWorkerHttp.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterDisposedError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import { createHotDecider } from "../../../src/serialDecide/createHotDecider.js";
import { createIoWorkerPool } from "../../../src/serialDecide/createIoWorkerPool.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";
import { gatedAppender } from "../../fixtures/gatedAppender.js";
import {
	createInitializeRequest,
	createState,
	createTrackCommand,
	testOrg,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const customer = residentIdentityOf({ customerId: "cus_hot" });
const route = { partition: 0, routeEpoch: "1" };

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

function watch(promise: Promise<Response>): {
	settled: boolean;
	response?: Response;
} {
	const box: { settled: boolean; response?: Response } = { settled: false };
	promise.then(
		(response) => {
			box.settled = true;
			box.response = response;
		},
		() => {
			box.settled = true;
		},
	);
	return box;
}

async function until(predicate: () => boolean, what: string): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!predicate()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await Bun.sleep(5);
	}
}

/** A writer of partition 0 on the shared board, with its own gate on the log. */
async function owner({
	board,
}: {
	board: ReturnType<typeof createPositionBoard>;
}) {
	const gate = gatedAppender();
	gate.open();
	const processor = await createResidentProcessor({
		states: [createState({ identity: customer, balance: 100 })],
		appender: gate.appender,
		positions: board.sinkFor({ partition: 0 }),
	});
	return { processor, gate };
}

describe("serial-decide arm D end to end", () => {
	const board = createPositionBoard({ config: { partitionCount: 1 } });
	const committed: number[] = [];
	const failed: { seq: number; lastSeq: number; cause: unknown }[] = [];
	board.onCommitted(({ seq }) => committed.push(seq));
	board.onFailedAbove(({ seq, lastSeq, cause }) =>
		failed.push({ seq, lastSeq, cause }),
	);
	let current: Awaited<ReturnType<typeof owner>>;
	let port: number;
	let pool: ReturnType<typeof createIoWorkerPool>;
	let listener: { stop(): Promise<void> };
	let classicFetch: ReturnType<typeof createBalanceWorkerFetch>;

	beforeAll(async () => {
		current = await owner({ board });
		const runtime: BalanceWorkerRequestContext["runtime"] = {
			process: (run) => run(current.processor),
			processHot: (run) => run(current.processor),
		};
		const ctx: BalanceWorkerHttpContext = {
			ownership: { findRuntime: () => runtime },
			partitionResolver: { partitionForIdentity: () => 0 },
			logger,
		};
		const app = createBalanceWorkerApp({ ctx });
		classicFetch = createBalanceWorkerFetch({ ctx, app });
		port = await freePort();
		pool = createIoWorkerPool({
			ctx: {
				fetch: classicFetch,
				logger,
				onFatal: ({ cause }) => {
					throw new Error(`unexpected pool failure: ${String(cause)}`);
				},
				hot: {
					decider: createHotDecider({ ctx, config: { partitionCount: 1 } }),
					positions: board,
				},
			},
			config: {
				hostname: "127.0.0.1",
				port,
				maxRequestBodySize: 1 << 20,
				workers: 2,
			},
		});
		listener = await pool.listen();
	});

	afterAll(async () => {
		await listener.stop();
	});

	function track({ commandId }: { commandId: string }): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}/v1/track`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				route,
				command: createTrackCommand({
					identity: customer,
					commandId,
					value: 1,
				}),
			}),
		});
	}

	function check({ requestId, at }: { requestId: string; at: number }): {
		hot: Promise<Response>;
		classic: () => Promise<Response>;
	} {
		const body = JSON.stringify({
			route,
			command: {
				schemaVersion: 1,
				type: "check",
				org: testOrg,
				requestId,
				identity: customer,
				featureId: "messages",
				internalFeatureId: "feat_messages",
				requiredBalance: 1,
				properties: null,
				occurredAt: at,
			},
		});
		const init = {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
		};
		return {
			hot: fetch(`http://127.0.0.1:${port}/v1/check`, init),
			classic: () =>
				Promise.resolve(
					classicFetch(new Request("http://worker/v1/check", init)),
				),
		};
	}

	function heldOnLanes(): number {
		let total = 0;
		for (const [lane, counters] of Object.entries(pool.readStats()))
			if (lane.startsWith("io")) total += counters.held ?? 0;
		return total;
	}

	/** The balance of the customer's one entitlement in a track reply's state. */
	function balanceOf(reply: unknown): number | undefined {
		const { state } = reply as {
			state: { customerEntitlements: { balance: number }[] };
		};
		return state.customerEntitlements[0]?.balance;
	}

	test("a hot track is answered only once its append is acknowledged, with the balance it decided", async () => {
		const before = committed.length;
		current.gate.hold();
		const reply = watch(track({ commandId: "cmd_1" }));
		await until(() => heldOnLanes() === 1, "the reply to be held");
		await Bun.sleep(100);
		expect(reply.settled).toBe(false);
		expect(pool.readStats().main).toMatchObject({ hot: 1, hotFallback: 0 });
		current.gate.open();
		await until(() => reply.settled, "the reply to be released");
		const response = reply.response as Response;
		expect(response.status).toBe(200);
		const body = (await response.json()) as { result: { status: string } };
		expect(body.result.status).toBe("applied");
		expect(balanceOf(body)).toBe(99);
		expect(committed).toHaveLength(before + 1);
		expect(board.readCommitPos({ partition: 0 })).toBe(committed.at(-1) ?? -1);
		expect(heldOnLanes()).toBe(0);
	});

	test("a check on the hot path is answered at once with the classic check's bytes, fresh and from the memo, before and after a hot track", async () => {
		const statsBefore = pool.readStats().main;
		const fresh = check({ requestId: "chk_1", at: 1_700_000_000_000 });
		const hot = await fresh.hot;
		expect(hot.status).toBe(200);
		expect(hot.headers.get("content-type")).toBe("application/json");
		const hotBytes = await hot.text();
		expect(await (await fresh.classic()).text()).toBe(hotBytes);
		expect(pool.readStats().main).toMatchObject({
			hot: statsBefore.hot + 1,
			hotFallback: statsBefore.hotFallback,
		});
		expect(heldOnLanes()).toBe(0);
		// A hot track moves the balance; the next check, decided fresh on the hot path, reads it like the classic one.
		expect((await track({ commandId: "cmd_chk" })).status).toBe(200);
		const after = check({ requestId: "chk_2", at: 1_700_000_001_000 });
		const classicBytes = await (await after.classic()).text();
		expect(await (await after.hot).text()).toBe(classicBytes);
		expect(balanceOf(JSON.parse(classicBytes))).toBe(98);
	});

	test("a refused append answers the held reply as the classic path would, and the owner serves the customer again", async () => {
		const positionBefore = board.readCommitPos({ partition: 0 });
		const { hot: hotBefore, hotFallback: fallbackBefore } =
			pool.readStats().main;
		current.gate.hold();
		const reply = watch(track({ commandId: "cmd_2" }));
		await until(() => heldOnLanes() === 1, "the reply to be held");
		const refusal = new MutationBatchNotCommittedError({
			cause: new Error("broker refused"),
		});
		current.gate.releaseNext(refusal);
		await until(() => reply.settled, "the reply to be failed");
		const response = reply.response as Response;
		const expected = workerErrorOf({
			cause: new MutationBatchAppendError({ cause: refusal }),
		});
		expect(response.status).toBe(expected.status);
		expect(response.headers.get("content-type")).toBe("application/json");
		expect(await response.json()).toEqual({ error: expected.error });
		expect(failed).toHaveLength(1);
		expect(failed[0]).toMatchObject({
			seq: positionBefore,
			lastSeq: positionBefore + 1,
		});
		expect(failed[0]?.cause).toBeInstanceOf(MutationBatchAppendError);
		// Dropping the refused projection un-resides the customer: the next track leaves the hot path for the
		// classic one, which reloads from a store this fixture keeps empty. Once the customer is resident again
		// the hot path serves it under sequence numbers above the failed range.
		current.gate.open();
		const classic = await track({ commandId: "cmd_3" });
		expect(classic.status).toBe(404);
		expect(pool.readStats().main).toMatchObject({
			hot: hotBefore + 2,
			hotFallback: fallbackBefore + 1,
		});
		await current.processor.initialize({
			request: createInitializeRequest({
				state: createState({ identity: customer, balance: 100 }),
				commandId: "init_again",
				requestId: "req_init_again",
			}),
		});
		const hot = await track({ commandId: "cmd_4" });
		expect(hot.status).toBe(200);
		expect(balanceOf(await hot.json())).toBe(99);
		expect(pool.readStats().main).toMatchObject({
			hot: hotBefore + 3,
			hotFallback: fallbackBefore + 1,
		});
		expect(committed.at(-1)).toBe(board.readCommitPos({ partition: 0 }));
		expect(committed.at(-1)).toBeGreaterThan(failed[0]?.lastSeq ?? 0);
		expect(heldOnLanes()).toBe(0);
	});

	test("an owner taken down mid-flight fails what it held, and a rebuilt owner continues above its numbers", async () => {
		current.gate.hold();
		const orphan = watch(track({ commandId: "cmd_5" }));
		await until(() => heldOnLanes() === 1, "the orphan to be held");
		const positionBefore = board.readCommitPos({ partition: 0 });
		current.processor.dispose();
		await until(() => orphan.settled, "the orphan to be answered");
		const response = orphan.response as Response;
		const expected = workerErrorOf({
			cause: new PartitionWriterDisposedError(),
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: expected.error });
		expect(failed.at(-1)).toMatchObject({
			seq: positionBefore,
			lastSeq: positionBefore + 1,
		});
		expect(failed.at(-1)?.cause).toBeInstanceOf(PartitionWriterDisposedError);
		// The successor opens on the same board: its initialization and first track land above the orphan's number.
		current = await owner({ board });
		const served = await track({ commandId: "cmd_6" });
		expect(served.status).toBe(200);
		expect(balanceOf(await served.json())).toBe(99);
		expect(board.readCommitPos({ partition: 0 })).toBeGreaterThan(
			positionBefore + 1,
		);
		expect(heldOnLanes()).toBe(0);
	});

	test("an append of unknown fate answers the held reply as the classic path reports a recovery: INTERNAL with the recovery reason", async () => {
		current.gate.hold();
		const reply = watch(track({ commandId: "cmd_7" }));
		await until(() => heldOnLanes() === 1, "the reply to be held");
		current.gate.releaseNext(new Error("socket closed"));
		await until(() => reply.settled, "the reply to be failed");
		const response = reply.response as Response;
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			error: {
				code: "INTERNAL",
				message:
					"The partition went into recovery with this command in flight; it may have landed",
				reason: PARTITION_RECOVERY_REASON,
			},
		});
		expect(failed.at(-1)?.cause).toBeInstanceOf(
			PartitionWriterRecoveryRequiredError,
		);
		expect(heldOnLanes()).toBe(0);
	});

	test("a track batch through the I/O workers is held until its one append is acknowledged, then answered per command", async () => {
		// The owner before went into recovery; a rebuilt one serves the customer.
		current.processor.dispose();
		current = await owner({ board });
		const before = committed.length;
		const statsBefore = pool.readStats().main;
		current.gate.hold();
		const reply = watch(
			fetch(`http://127.0.0.1:${port}/v1/track-batch`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					route,
					commands: ["cmd_b1", "cmd_b2"].map((commandId) =>
						createTrackCommand({ identity: customer, commandId, value: 1 }),
					),
				}),
			}),
		);
		await until(() => heldOnLanes() === 1, "the batch reply to be held");
		await Bun.sleep(50);
		expect(reply.settled).toBe(false);
		expect(pool.readStats().main).toMatchObject({
			hot: statsBefore.hot + 1,
			hotFallback: statsBefore.hotFallback,
		});
		current.gate.open();
		await until(() => reply.settled, "the batch reply to be released");
		const response = reply.response as Response;
		expect(response.status).toBe(200);
		const { results } = (await response.json()) as {
			results: { ok: boolean; reply: { result: { status: string } } }[];
		};
		expect(results.map((result) => result.reply.result.status)).toEqual([
			"applied",
			"applied",
		]);
		expect(committed).toHaveLength(before + 1);
		expect(heldOnLanes()).toBe(0);
	});
});
