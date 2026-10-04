import { describe, expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { serializeSubjectReply } from "../../../src/http/replies/serializeSubjectReply.js";
import {
	MutationBatchAppendError,
	MutationBatchNotCommittedError,
	PartitionWriterCapacityError,
	PartitionWriterCommandConflictError,
	PartitionWriterRecoveryRequiredError,
} from "../../../src/processor/writer/writerErrors.js";
import { createPositionBoard } from "../../../src/serialDecide/positionBoard.js";
import {
	createInitializeRequest,
	createState,
	createTrackCommand,
} from "../../fixtures/mutations.js";
import {
	createResidentProcessor,
	residentIdentityOf,
} from "../../fixtures/residentProcessor.js";

const cus1 = residentIdentityOf({ customerId: "cus_1" });
const cus2 = residentIdentityOf({ customerId: "cus_2" });

type Positions = {
	committed: number[];
	failed: { seq: number; lastSeq: number; cause: unknown }[];
};

/** The production board for one partition, with what it published recorded for the assertions. */
function recordingBoard() {
	const board = createPositionBoard({ config: { partitionCount: 1 } });
	const positions: Positions = { committed: [], failed: [] };
	board.onCommitted(({ seq }) => positions.committed.push(seq));
	board.onFailedAbove(({ seq, lastSeq, cause }) =>
		positions.failed.push({ seq, lastSeq, cause }),
	);
	return { board, positions };
}

/** An appender whose batches a test releases by hand, recording what it was given. */
function gatedAppender() {
	const batches: {
		outcomes: readonly MeteringRecord[];
		release: (outcome?: unknown) => void;
	}[] = [];
	let appended = 0n;
	let held = true;
	return {
		batches,
		hold() {
			held = true;
		},
		open() {
			held = false;
			for (const batch of batches.splice(0)) batch.release();
		},
		releaseNext(outcome?: unknown) {
			batches.shift()?.release(outcome);
		},
		appender: {
			appendCommitted: ({
				outcomes,
			}: {
				outcomes: readonly MeteringRecord[];
			}) =>
				new Promise<{ baseOffset: bigint }>((resolve, reject) => {
					function release(outcome?: unknown): void {
						if (outcome instanceof Error) {
							reject(outcome);
							return;
						}
						const baseOffset = appended;
						appended += BigInt(outcomes.length);
						resolve({ baseOffset });
					}
					if (!held) {
						release();
						return;
					}
					batches.push({ outcomes, release });
				}),
		},
	};
}

async function residentWithPositions({
	balance = 100,
	gated = false,
	beforeApply,
	maxPendingCommandsPerCustomer = 1_000,
	board = recordingBoard(),
}: {
	balance?: number;
	gated?: boolean;
	beforeApply?: () => Promise<void>;
	maxPendingCommandsPerCustomer?: number;
	/** A board an earlier writer of the partition already used. */
	board?: ReturnType<typeof recordingBoard>;
} = {}) {
	const { positions } = board;
	const gate = gatedAppender();
	// The initializations commit through an open gate; a gated test holds the appends that follow.
	gate.open();
	const processor = await createResidentProcessor({
		states: [
			createState({ identity: cus1, balance }),
			createState({ identity: cus2, balance }),
		],
		appender: gate.appender,
		positions: board.board.sinkFor({ partition: 0 }),
		committer: { beforeApply },
		config: {
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 1_000,
				maxPendingCommandsPerCustomer,
			},
		},
	});
	await settled();
	positions.committed.length = 0;
	if (gated) gate.hold();
	return { processor, positions, gate, board };
}

async function settled(): Promise<void> {
	for (let i = 0; i < 20; i++)
		await new Promise((resolve) => setImmediate(resolve));
}

describe("lean track (serial-decide arm D)", () => {
	test("a hot track answers the same bytes as the classic track and commits the same record, released at its sequence number", async () => {
		const classic = await createResidentProcessor({
			states: [createState({ identity: cus1, balance: 100 })],
		});
		const { processor, positions } = await residentWithPositions();
		const command = createTrackCommand({
			identity: cus1,
			commandId: "cmd_1",
			value: 5,
		});
		const expected = serializeSubjectReply({
			reply: await classic.track({ command }),
		});
		const hot = processor.trackHot({ command });
		expect(hot).not.toBeNull();
		expect(hot?.seq).toBeGreaterThan(0);
		expect(hot?.status).toBe(200);
		expect(hot?.body).toBe(expected);
		await settled();
		expect(positions.committed).toEqual([hot?.seq ?? 0]);
		// The next command sees the deduction: the projection advanced exactly as the classic path's does.
		const next = processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_2",
				value: 5,
			}),
		});
		expect(next?.seq).toBe((hot?.seq ?? 0) + 1);
		expect(next?.body).not.toBe(expected);
	});

	test("a retry while the write is in flight gets the same reply held on the same sequence number; a changed retry is a conflict", async () => {
		const { processor, positions, gate } = await residentWithPositions({
			gated: true,
		});
		const command = createTrackCommand({
			identity: cus1,
			commandId: "cmd_1",
			value: 5,
		});
		const first = processor.trackHot({ command });
		const retry = processor.trackHot({ command });
		expect({ seq: retry?.seq, body: retry?.body }).toEqual({
			seq: first?.seq,
			body: first?.body,
		});
		expect(() =>
			processor.trackHot({
				command: createTrackCommand({
					identity: cus1,
					commandId: "cmd_1",
					value: 7,
				}),
			}),
		).toThrow(PartitionWriterCommandConflictError);
		expect(positions.committed).toEqual([]);
		gate.open();
		await settled();
		expect(positions.committed).toEqual([first?.seq ?? 0]);
	});

	test("a customer with a classic command in flight is not served hot until that command commits", async () => {
		const { processor, gate } = await residentWithPositions({ gated: true });
		const classic = processor.track({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_c",
				value: 1,
			}),
		});
		await settled();
		expect(
			processor.trackHot({
				command: createTrackCommand({
					identity: cus1,
					commandId: "cmd_h",
					value: 1,
				}),
			}),
		).toBeNull();
		// Another customer is unaffected.
		expect(
			processor.trackHot({
				command: createTrackCommand({
					identity: cus2,
					commandId: "cmd_o",
					value: 1,
				}),
			}),
		).not.toBeNull();
		gate.open();
		await classic;
		await settled();
		expect(
			processor.trackHot({
				command: createTrackCommand({
					identity: cus1,
					commandId: "cmd_h2",
					value: 1,
				}),
			}),
		).not.toBeNull();
	});

	test("a lock, a subject not resident, or a track queued in a run leave the hot path", async () => {
		const { processor } = await residentWithPositions();
		expect(
			processor.trackHot({
				command: {
					...createTrackCommand({ identity: cus1, commandId: "cmd_lock" }),
					lock: { lockId: "lock_1", expiresAt: 1 },
				} as never,
			}),
		).toBeNull();
		expect(
			processor.trackHot({
				command: createTrackCommand({
					identity: residentIdentityOf({ customerId: "cus_none" }),
					commandId: "cmd_n",
				}),
			}),
		).toBeNull();
		// A classic sync track queued for the subject decides on the next turn; a hot track must not overtake it.
		const queued = processor.track({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_q",
				value: 1,
			}),
		});
		expect(
			processor.trackHot({
				command: createTrackCommand({
					identity: cus1,
					commandId: "cmd_after",
					value: 1,
				}),
			}),
		).toBeNull();
		await queued;
	});

	test("a broker refusal fails every held reply above the commit position and the partition carries on", async () => {
		const { processor, positions, gate } = await residentWithPositions({
			gated: true,
		});
		const first = processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_1",
				value: 1,
			}),
		});
		const firstSeq = first?.seq ?? 0;
		await settled();
		gate.releaseNext(
			new MutationBatchNotCommittedError({ cause: new Error("refused") }),
		);
		await settled();
		expect(positions.failed).toHaveLength(1);
		// Everything the initializations committed stands; the position names the last of them, the range ends at the refused write.
		expect(positions.failed[0]?.seq).toBe(firstSeq - 1);
		expect(positions.failed[0]?.lastSeq).toBe(firstSeq);
		expect(positions.failed[0]?.cause).toBeInstanceOf(MutationBatchAppendError);
		// The dropped projection leaves no rows resident, so the hot path steps aside; once the customer is
		// resident again the healthy writer commits under the next sequence numbers.
		gate.open();
		const command = createTrackCommand({
			identity: cus1,
			commandId: "cmd_2",
			value: 1,
		});
		expect(processor.trackHot({ command })).toBeNull();
		await processor.initialize({
			request: createInitializeRequest({
				state: createState({ identity: cus1, balance: 100 }),
				commandId: "init_again",
				requestId: "req_init_again",
			}),
		});
		const second = processor.trackHot({ command });
		expect(second?.seq).toBe(firstSeq + 2);
		await settled();
		expect(positions.committed).toEqual([firstSeq + 1, firstSeq + 2]);
	});

	test("an append of unknown fate fails held replies with the recovery error and refuses what follows", async () => {
		const { processor, positions, gate } = await residentWithPositions({
			gated: true,
		});
		processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_1",
				value: 1,
			}),
		});
		await settled();
		gate.releaseNext(new Error("socket closed"));
		await settled();
		expect(positions.failed[0]?.cause).toBeInstanceOf(
			PartitionWriterRecoveryRequiredError,
		);
		// Nothing is resident any more, so the hot path steps aside; every write the writer is asked for reports the recovery.
		const command = createTrackCommand({
			identity: cus1,
			commandId: "cmd_2",
			value: 1,
		});
		expect(processor.trackHot({ command })).toBeNull();
		let caught: unknown;
		try {
			await processor.initialize({
				request: createInitializeRequest({
					state: createState({ identity: cus1, balance: 100 }),
					commandId: "init_again",
					requestId: "req_init_again",
				}),
			});
		} catch (cause) {
			caught = cause;
		}
		expect(caught).toBeInstanceOf(PartitionWriterRecoveryRequiredError);
	});

	test("capacity refuses a hot track while the customer's lean writes are in flight, and admits one once they are acknowledged", async () => {
		const { processor, gate } = await residentWithPositions({
			gated: true,
			maxPendingCommandsPerCustomer: 2,
		});
		const trackOf = (commandId: string) =>
			createTrackCommand({ identity: cus1, commandId, value: 1 });
		expect(processor.trackHot({ command: trackOf("cmd_1") })).not.toBeNull();
		expect(processor.trackHot({ command: trackOf("cmd_2") })).not.toBeNull();
		expect(() => processor.trackHot({ command: trackOf("cmd_3") })).toThrow(
			PartitionWriterCapacityError,
		);
		gate.open();
		await settled();
		expect(processor.trackHot({ command: trackOf("cmd_3") })).not.toBeNull();
	});

	test("an evict waits for the store to hold the lean write before dropping the rows", async () => {
		let holdStore = Promise.withResolvers<void>();
		const { processor } = await residentWithPositions({
			beforeApply: () => holdStore.promise,
		});
		processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_1",
				value: 1,
			}),
		});
		await settled();
		let evicted = false;
		const evict = processor
			.evict({
				command: {
					schemaVersion: 1,
					type: "evict",
					requestId: "req_ev_1",
					identity: cus1,
					occurredAt: 1_700_000_000_000,
				},
			})
			.then(() => {
				evicted = true;
			});
		await settled();
		expect(evicted).toBe(false);
		holdStore.resolve();
		holdStore = Promise.withResolvers<void>();
		holdStore.resolve();
		await evict;
		expect(evicted).toBe(true);
	});

	test("a writer rebuilt on the partition numbers its writes above everything its predecessor issued", async () => {
		const first = await residentWithPositions({ gated: true });
		const held = first.processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_1",
				value: 1,
			}),
		});
		const heldSeq = held?.seq ?? 0;
		expect(heldSeq).toBeGreaterThan(0);
		const commitPos = first.board.board.readCommitPos({ partition: 0 });
		expect(commitPos).toBe(heldSeq - 1);
		// The predecessor goes away with its write still in flight: a recovery, a revoke, a stop that could not drain.
		first.processor.dispose();
		expect(first.positions.failed).toEqual([
			{
				seq: commitPos,
				lastSeq: heldSeq,
				cause: expect.objectContaining({
					name: "PartitionWriterDisposedError",
				}),
			},
		]);
		// The successor's initializations and first hot write all land above the predecessor's last number, so a
		// reply still held on `heldSeq` can never be mistaken for one of them.
		const second = await residentWithPositions({ board: first.board });
		const next = second.processor.trackHot({
			command: createTrackCommand({
				identity: cus1,
				commandId: "cmd_2",
				value: 1,
			}),
		});
		expect(next?.seq).toBe(heldSeq + 3);
		await settled();
		expect(second.positions.committed).toEqual([heldSeq + 3]);
		expect(second.board.board.readCommitPos({ partition: 0 })).toBe(
			heldSeq + 3,
		);
	});
});
