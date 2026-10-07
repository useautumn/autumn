import { describe, expect, test } from "bun:test";
import {
	type EvictCommand,
	parseEvictCommand,
	parseResetCommand,
	parseTrackCommand,
	type ResetCommand,
	type TrackCommand,
	UnsupportedCommandError,
} from "@autumn/balance-engine";
import { buildIdempotencyStorageKey } from "@autumn/dynamodb";
import { BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT } from "@autumn/env/balanceWorkerConstants";
import { serializeCommandRecord } from "@autumn/kafka";
import { FlushRecordRefusedError } from "../../../src/committer/committerErrors.js";
import { CommandPartitionUnavailableError } from "../../../src/kafka/commandConsumer/commandConsumerErrors.js";
import { createCommandRecordHandler } from "../../../src/kafka/commandConsumer/createCommandRecordHandler.js";
import type { PartitionRuntimePort } from "../../../src/partitions/types/partitions.js";
import {
	MutationBatchNotCommittedError,
	PartitionWriterDuplicateCommandError,
} from "../../../src/processor/writer/writerErrors.js";
import { createFakeIdempotencyKeys } from "../../fixtures/idempotencyKeys.js";
import {
	createTrackCommand,
	testIdentity,
	testOrg,
} from "../../fixtures/mutations.js";

const topic = "local-commands";
const partition = 0;

function createFixture({
	outcome,
	owned = true,
	commandNextOffset = null,
	canPark = false,
	evictLog,
	commitFailures = [],
}: {
	outcome?: "applied" | "rejected" | Error;
	owned?: boolean;
	commandNextOffset?: bigint | null;
	/** Gives the handler somewhere to park a partition, as the worker wiring does. */
	canPark?: boolean;
	evictLog?: Promise<void>;
	/** Each track's commit fails with the next of these, in order; once used up, commits land. */
	commitFailures?: Error[];
} = {}) {
	const tracked: TrackCommand[] = [];
	const evicted: EvictCommand[] = [];
	const sources: unknown[] = [];
	const completed: unknown[] = [];
	const logs: string[] = [];
	const parked: { partition: number; cause: unknown }[] = [];
	const committed: string[] = [];
	const keys = createFakeIdempotencyKeys();
	let deferredLogs: { add(log: Promise<void>): void } | undefined;
	const runtime = {
		process: async (run: (processor: never) => Promise<unknown>) => {
			const processor = {
				execute: async ({
					source,
					run,
					deferredLogs: logs,
				}: {
					source: unknown;
					run: (processor: never) => Promise<unknown>;
					deferredLogs?: { add(log: Promise<void>): void };
				}) => {
					deferredLogs = logs;
					sources.push(source);
					const result = await run(processor as never);
					completed.push(source);
					return result;
				},
				decideTrack: async (params: { command: TrackCommand }) => {
					expect(Object.keys(params)).toEqual(["command"]);
					tracked.push(params.command);
					if (outcome instanceof Error) throw outcome;
					const result = {
						type: "track",
						status: outcome ?? "applied",
						reason: null,
					};
					const commitFailure = commitFailures.shift();
					async function waitForCommit() {
						if (commitFailure) throw commitFailure;
						committed.push(params.command.commandId);
						return { mutation: { result } };
					}
					return { kind: "write", waitForCommit };
				},
				decideReset: async () => {
					if (outcome instanceof Error) throw outcome;
					return {
						kind: "reply",
						waitForCommit: async () => ({ result: null }),
					};
				},
				evict: async (params: { command: EvictCommand }) => {
					evicted.push(params.command);
					if (evictLog) deferredLogs?.add(evictLog);
					if (outcome instanceof Error) throw outcome;
					return { evicted: true };
				},
			};
			return run(processor as never);
		},
	} as unknown as PartitionRuntimePort;
	const handler = createCommandRecordHandler({
		ctx: {
			findOwnedRuntime: () => (owned ? runtime : undefined),
			readCommandNextOffset: () => commandNextOffset,
			idempotencyKeys: keys.keys,
			logger: {
				info: (message: string) => logs.push(`info:${message}`),
				warn: (message: string) => logs.push(`warn:${message}`),
			} as never,
			...(canPark && {
				markUnavailable: (failure: { partition: number; cause: unknown }) => {
					parked.push(failure);
				},
			}),
		},
	});
	return {
		handler,
		tracked,
		evicted,
		sources,
		logs,
		completed,
		parked,
		committed,
		keys,
	};
}

const command = parseTrackCommand({
	input: createTrackCommand({
		identity: testIdentity,
		commandId: "cmd_1",
		value: 2,
	}),
});

const resetCommand = parseResetCommand({
	input: {
		schemaVersion: 1,
		type: "reset",
		commandId: "reset_cus_1_1",
		requestId: "reset_cus_1_1",
		identity: testIdentity,
		occurredAt: 1_700_000_000_000,
		org: testOrg,
	},
});

const evictCommand = parseEvictCommand({
	input: {
		schemaVersion: 1,
		type: "evict",
		requestId: "req_evict",
		identity: testIdentity,
		occurredAt: 1_700_000_000_000,
	},
});

const idempotency = { key: "track:item_1", ttlMs: 60_000 };
const keyedCommand = parseTrackCommand({
	input: {
		...createTrackCommand({
			identity: testIdentity,
			commandId: "cmd_keyed",
			value: 1,
		}),
		idempotency,
	},
});
const { storageKey: keyedStorageKey } = buildIdempotencyStorageKey({
	orgId: testIdentity.orgId,
	env: testIdentity.env,
	idempotencyKey: idempotency.key,
});

function recordOf({
	command: record,
}: {
	command: TrackCommand | ResetCommand | EvictCommand;
}) {
	return {
		topic,
		partition,
		message: { offset: "7", ...serializeCommandRecord({ record }) },
	};
}

describe("command record handler", () => {
	test("a queued track reaches the partition's processor and resolves with no reply", async () => {
		const { handler, tracked, logs, completed } = createFixture();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 0n }),
		).toBeNull();
		expect(await handler.applyRecord(recordOf({ command }))).toBeUndefined();
		expect(tracked).toEqual([command]);
		expect(completed).toEqual([{ commandOffset: "7" }]);
		expect(logs).toEqual([]);
	});

	test("a queued track and evict from a newer server are consumed without their unknown fields, not skipped", async () => {
		const { handler, tracked, evicted, logs } = createFixture();
		const fromNewerServer = <Queued extends TrackCommand | EvictCommand>(
			queued: Queued,
		) => ({ ...queued, futureField: true }) as Queued;

		await handler.applyRecord(recordOf({ command: fromNewerServer(command) }));
		await handler.applyRecord(
			recordOf({ command: fromNewerServer(evictCommand) }),
		);

		expect(tracked).toEqual([command]);
		expect(evicted).toEqual([evictCommand]);
		expect(logs).not.toContain("warn:Queued command skipped: unreadable");
	});

	test("the record's offset belongs to the execution, not the track command, and the bookmark skips a batch that starts below it", async () => {
		const { handler, sources } = createFixture({ commandNextOffset: 5n });
		await handler.applyRecord(recordOf({ command }));
		expect(sources).toEqual([{ commandOffset: "7" }]);
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 2n }),
		).toBe(5n);
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 5n }),
		).toBeNull();
		expect(
			handler.readResumeOffset({ topic, partition, firstOffset: 9n }),
		).toBeNull();
	});

	test("a record below the durable bookmark never reaches business processing", async () => {
		const { handler, tracked, completed } = createFixture({
			commandNextOffset: 8n,
		});
		expect(await handler.applyRecord(recordOf({ command }))).toEqual({
			nextOffset: 8n,
		});
		expect(tracked).toEqual([]);
		expect(completed).toEqual([]);
	});

	test("already applied and refused outcomes are logged and consumed, not thrown", async () => {
		const duplicate = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({ commandId: "cmd_1" }),
		});
		await duplicate.handler.applyRecord(recordOf({ command }));
		expect(duplicate.completed).toEqual([{ commandOffset: "7" }]);
		expect(duplicate.logs).toEqual(["info:Queued track already applied"]);

		const refused = createFixture({
			outcome: new UnsupportedCommandError({ reason: "entity_not_found" }),
		});
		await refused.handler.applyRecord(recordOf({ command }));
		expect(refused.completed).toEqual([{ commandOffset: "7" }]);
		expect(refused.logs).toEqual(["warn:Queued track refused"]);

		const rejected = createFixture({ outcome: "rejected" });
		await rejected.handler.applyRecord(recordOf({ command }));
		await rejected.handler.settleBatch?.({ topic, partition });
		expect(rejected.logs).toEqual([
			"warn:Queued track rejected by the balance",
		]);
	});

	test("a redelivered reset whose id was already applied is consumed, never thrown: the poison that crash-looped a partition", async () => {
		const duplicate = createFixture({
			outcome: new PartitionWriterDuplicateCommandError({
				commandId: "reset_cus_1_1",
			}),
		});
		await duplicate.handler.applyRecord(recordOf({ command: resetCommand }));
		expect(duplicate.completed).toEqual([{ commandOffset: "7" }]);
		expect(duplicate.logs).toEqual(["info:Queued reset already applied"]);

		const idle = createFixture();
		await idle.handler.applyRecord(recordOf({ command: resetCommand }));
		expect(idle.logs).toEqual(["info:Queued reset found nothing due"]);
	});

	test("a queued evict reaches the processor and its offset is bookmarked like any consumed record", async () => {
		const fixture = createFixture();
		await fixture.handler.applyRecord(recordOf({ command: evictCommand }));
		expect(fixture.evicted).toEqual([evictCommand]);
		expect(fixture.completed).toEqual([{ commandOffset: "7" }]);
		expect(fixture.logs).toEqual([]);
	});

	test("a queued evict does not hold the stream for its record: the batch waits for it before its offset commits", async () => {
		const log = Promise.withResolvers<void>();
		const fixture = createFixture({ evictLog: log.promise });
		await fixture.handler.applyRecord(recordOf({ command: evictCommand }));
		const settling = fixture.handler.settleBatch?.({ topic, partition });
		expect(settling).toBeInstanceOf(Promise);
		const early = await Promise.race([
			settling?.then(() => "settled"),
			Bun.sleep(20).then(() => "waiting"),
		]);
		expect(early).toBe("waiting");
		log.resolve();
		await settling;
	});

	test("an evict record the broker refused parks the partition when the batch settles", async () => {
		const log = Promise.withResolvers<void>();
		const fixture = createFixture({ evictLog: log.promise, canPark: true });
		await fixture.handler.applyRecord(recordOf({ command: evictCommand }));
		log.reject(
			new MutationBatchNotCommittedError({
				cause: new Error("CONCURRENT_TRANSACTIONS"),
			}),
		);
		await fixture.handler.settleBatch?.({ topic, partition });
		expect(fixture.parked).toHaveLength(1);
		expect(fixture.parked[0]?.partition).toBe(partition);
	});

	test("anything else is thrown so Kafka redelivers, and an unowned partition never consumes", async () => {
		const failing = createFixture({ outcome: new Error("recovery required") });
		await expect(
			failing.handler.applyRecord(recordOf({ command })),
		).rejects.toThrow("recovery required");
		expect(failing.completed).toEqual([]);

		const unowned = createFixture({ owned: false });
		await expect(
			unowned.handler.applyRecord(recordOf({ command })),
		).rejects.toBeInstanceOf(CommandPartitionUnavailableError);
		expect(unowned.tracked).toEqual([]);
		expect(failing.completed).toEqual([]);
		expect(unowned.completed).toEqual([]);
	});

	test("a batch the broker refused parks the partition instead of reaching kafkajs, and the record is not consumed", async () => {
		const cause = new MutationBatchNotCommittedError({
			cause: new Error("CONCURRENT_TRANSACTIONS"),
		});
		const fixture = createFixture({ outcome: cause, canPark: true });
		await expect(
			fixture.handler.applyRecord(recordOf({ command })),
		).resolves.toBeUndefined();
		expect(fixture.parked).toEqual([{ partition, cause }]);
		expect(fixture.completed).toEqual([]);
		expect(fixture.logs).toEqual([
			"warn:Queued command could not be committed; parking the partition",
		]);
	});

	test("without somewhere to park, and for failures that are not the partition's own, the throw still reaches Kafka for redelivery", async () => {
		const refused = new MutationBatchNotCommittedError({
			cause: new Error("CONCURRENT_TRANSACTIONS"),
		});
		const unwired = createFixture({ outcome: refused });
		await expect(
			unwired.handler.applyRecord(recordOf({ command })),
		).rejects.toBe(refused);

		const blip = createFixture({
			outcome: new Error("postgres connection reset"),
			canPark: true,
		});
		await expect(
			blip.handler.applyRecord(recordOf({ command })),
		).rejects.toThrow("postgres connection reset");
		expect(blip.parked).toEqual([]);
	});

	test("an unreadable record is skipped with a warning instead of failing the partition", async () => {
		const { handler, tracked, logs, completed } = createFixture();
		await handler.applyRecord({
			topic,
			partition,
			message: { offset: "7", key: null, value: Buffer.from("not json") },
		});
		expect(tracked).toEqual([]);
		expect(completed).toEqual([{ commandOffset: "7" }]);
		expect(logs).toEqual(["warn:Queued command skipped: unreadable"]);
	});

	test("a commit the store refused is consumed and frees the track's idempotency key, as a refused decide does", async () => {
		const fixture = createFixture({
			commitFailures: [
				new FlushRecordRefusedError({
					mutationId: "cmd_keyed",
					cause: new Error("check constraint"),
				}),
			],
		});
		await fixture.handler.applyRecord(recordOf({ command: keyedCommand }));
		await fixture.handler.settleBatch?.({ topic, partition });
		expect(fixture.keys.released).toEqual([keyedStorageKey]);
		expect(fixture.logs).toEqual(["warn:Queued track refused"]);
	});

	test("a commit that failed transiently keeps the key and reaches Kafka; the redelivery resumes the claim and applies exactly once", async () => {
		const fixture = createFixture({
			commitFailures: [new Error("broker away")],
		});
		await fixture.handler.applyRecord(recordOf({ command: keyedCommand }));
		await expect(
			fixture.handler.settleBatch?.({ topic, partition }),
		).rejects.toThrow("broker away");
		expect(fixture.keys.released).toEqual([]);
		expect(fixture.keys.owners.get(keyedStorageKey)).toBe(
			keyedCommand.requestId,
		);

		await fixture.handler.applyRecord(recordOf({ command: keyedCommand }));
		await fixture.handler.settleBatch?.({ topic, partition });
		expect(fixture.tracked.map((tracked) => tracked.commandId)).toEqual([
			"cmd_keyed",
			"cmd_keyed",
		]);
		expect(fixture.committed).toEqual(["cmd_keyed"]);
	});

	test("a track the balance rejected is logged once its commit lands", async () => {
		const fixture = createFixture({ outcome: "rejected" });
		await fixture.handler.applyRecord(recordOf({ command }));
		await fixture.handler.settleBatch?.({ topic, partition });
		expect(fixture.logs).toEqual(["warn:Queued track rejected by the balance"]);
	});

	test("held evicts and decided commands share one in-flight bound", async () => {
		const evictLog = Promise.withResolvers<void>();
		const fixture = createFixture({ evictLog: evictLog.promise });
		for (
			let index = 0;
			index < BALANCE_WORKER_QUEUED_COMMITS_IN_FLIGHT;
			index++
		)
			await fixture.handler.applyRecord(recordOf({ command: evictCommand }));

		const blocked = fixture.handler.applyRecord(recordOf({ command }));
		await Bun.sleep(20);
		expect(fixture.tracked).toEqual([]);

		evictLog.resolve();
		await blocked;
		expect(fixture.tracked).toEqual([command]);
		await fixture.handler.settleBatch?.({ topic, partition });
	});
});
