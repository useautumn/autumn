import { describe, expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import { parseKafkaOffset } from "../../src/client/kafkaOffsetUtils.js";
import { createLibrdkafkaConsumer } from "../../src/client/librdkafka/consumer/createLibrdkafkaConsumer.js";
import type {
	NativeConsumer,
	NativeKafkaError,
	NativeRebalanceCallback,
	NativeTopicPartition,
	NativeTopicPartitionOffset,
} from "../../src/client/librdkafka/consumer/types/nativeConsumer.js";
import { createKafkaLog } from "../../src/client/librdkafka/kafkaLog.js";
import { createProgressTracker } from "../../src/consumer/createProgressTracker.js";
import type { Consumer, EachBatchPayload } from "../../src/kafka.js";
import { createRandom, fuzzSeeds, type Random } from "./fuzzRandom.js";

/**
 * Property tests for the librdkafka consumer runner against a native consumer modelled on librdkafka's:
 * a log per partition with records, compacted gaps and transaction markers; a fetch position each poll reads
 * from and advances; seeks that reposition the fetch only when librdkafka runs them, so records a poll popped
 * before that are stale; cooperative (KIP-848) assign and revoke, served inside a poll or heard late; pause,
 * resume, commit and committed() failures, and watermarks lost to a failed fetch.
 *
 * Replay a failure with FUZZ_SEED=<seed>; widen the sweep with FUZZ_RUNS=<n>.
 */

const ASSIGN = LIBRDKAFKA_ERROR_CODES.ERR__ASSIGN_PARTITIONS;
const REVOKE = LIBRDKAFKA_ERROR_CODES.ERR__REVOKE_PARTITIONS;
const topic = "metering";

type Slot = "record" | "gap" | "marker";

type NativePartition = {
	pos: number;
	paused: boolean;
	eofArmed: boolean;
	/** Where the fetch was last repositioned: deliveries since must run on from here without a gap. */
	cursor: number;
	deliveredSinceReset: Set<number>;
};

type FuzzOptions = {
	random: Random;
	partitionCount: number;
	chaosPolls: number;
	/** A record popped before a seek librdkafka ran while the poll was in flight comes back with the poll. */
	racingSeeks: boolean;
	lateRebalances: boolean;
	weirdOffsets: boolean;
};

function nativeError(code: number, message = `native error ${code}`) {
	return Object.assign(new Error(message), { code }) as NativeKafkaError;
}

function createWorld(options: FuzzOptions) {
	const { random, partitionCount } = options;
	const logs: Slot[][] = [];
	for (let partition = 0; partition < partitionCount; partition++) {
		const slots: Slot[] = [];
		const length = random.int(0, 40);
		for (let offset = 0; offset < length; offset++)
			slots.push(
				random.chance(0.7) ? "record" : random.chance(0.5) ? "gap" : "marker",
			);
		logs.push(slots);
	}
	const committed = new Map<number, number>();
	const assigned = new Map<number, NativePartition>();
	/** The coordinator's view: what it has dealt this member, ahead of the member hearing of it. */
	const dealt = new Set<number>();
	const handled = Array.from(
		{ length: partitionCount },
		() => new Set<number>(),
	);
	const appSeekFloor = new Map<number, number>();
	const violations: string[] = [];
	const trace: string[] = [];
	const listeners = new Map<string, ((...args: never[]) => void)[]>();
	const stats = {
		polls: 0,
		commits: 0,
		failedCommits: 0,
		seeks: 0,
		deliveries: 0,
	};
	let rebalance: NativeRebalanceCallback | undefined;
	let calm = false;
	let leaving = false;
	let pendingRevokeAll = false;
	let externalAction: (() => void) | null = null;
	let commitQueue = Promise.resolve();
	/** Where the application sought, per partition: a commit below the landed one is expected at or past one. A restart racing
	 *  another partition's in-flight commit also moves it back (repeats, never a loss), so it is traced, not failed. */
	const appSeekTargets = new Map<number, number[]>();
	/** Rebalances librdkafka served in a poll whose callbacks reach JS after the poll's records; in order. */
	const lateChanges: { code: number; partitions: NativeTopicPartition[] }[] =
		[];
	function flushLateChanges(): void {
		while (lateChanges.length > 0) {
			const change = lateChanges.shift() as (typeof lateChanges)[number];
			if (change.code === ASSIGN && leaving) continue;
			serveRebalance(change);
		}
	}

	function note(line: string): void {
		trace.push(line);
		if (trace.length > Number(process.env.FUZZ_TRACE ?? 80)) trace.shift();
	}
	function violate(line: string): void {
		note(`VIOLATION ${line}`);
		violations.push(line);
	}
	function emit(event: string, ...args: unknown[]): void {
		for (const listener of listeners.get(event) ?? [])
			(listener as (...a: unknown[]) => void)(...args);
	}
	function slotsOf(partition: number): Slot[] {
		return logs[partition] as Slot[];
	}
	function reposition(partition: number, offset: number): void {
		const native = assigned.get(partition);
		if (!native) return;
		const length = slotsOf(partition).length;
		let position = offset;
		if (offset === -2 || offset === -1001) position = 0;
		else if (offset === -1) position = length;
		else if (offset < 0 || offset > length) position = 0;
		native.pos = position;
		native.cursor = position;
		native.eofArmed = true;
		native.deliveredSinceReset = new Set();
		note(`reposition p${partition} -> ${position}`);
	}
	function lastRecordOf(partition: number): number {
		const slots = slotsOf(partition);
		for (let offset = slots.length - 1; offset >= 0; offset--)
			if (slots[offset] === "record") return offset;
		return -1;
	}
	function isHandled(partition: number, offset: number): boolean {
		return (
			(handled[partition] as Set<number>).has(offset) ||
			offset < (appSeekFloor.get(partition) ?? 0)
		);
	}

	/** What a handler processing `offset` of `partition` may assume: it is ours, a record, and next in line. */
	function deliver(partition: number, offset: number): void {
		stats.deliveries += 1;
		note(`deliver p${partition}@${offset}`);
		const native = assigned.get(partition);
		if (!native) {
			violate(`p${partition}@${offset} delivered while not assigned`);
			return;
		}
		if (slotsOf(partition)[offset] !== "record")
			violate(`p${partition}@${offset} delivered but is no record`);
		if (offset < native.cursor) {
			violate(
				`p${partition}@${offset} delivered below the fetch position ${native.cursor} (stale)`,
			);
			return;
		}
		if (native.deliveredSinceReset.has(offset))
			violate(`p${partition}@${offset} delivered twice without a reposition`);
		for (let earlier = native.cursor; earlier < offset; earlier++) {
			if (slotsOf(partition)[earlier] !== "record") continue;
			if (!native.deliveredSinceReset.has(earlier)) {
				violate(
					`p${partition}@${offset} delivered past undelivered ${earlier} (gap from ${native.cursor})`,
				);
				break;
			}
		}
		native.deliveredSinceReset.add(offset);
	}

	function checkCommit(partition: number, offset: number): void {
		const slots = slotsOf(partition);
		if (offset > slots.length)
			violate(
				`p${partition} committed ${offset} past the log end ${slots.length}`,
			);
		for (let earlier = 0; earlier < Math.min(offset, slots.length); earlier++) {
			if (slots[earlier] !== "record") continue;
			if (!isHandled(partition, earlier)) {
				violate(
					`p${partition} committed ${offset} past ${earlier}, which no handler finished`,
				);
				return;
			}
		}
	}

	function later(run: () => void): void {
		const mode = random.int(0, 2);
		if (mode === 0) queueMicrotask(run);
		else setTimeout(run, mode === 1 ? 0 : 1);
	}

	function groupChanges(): {
		code: number;
		partitions: NativeTopicPartition[];
	}[] {
		if (pendingRevokeAll || leaving) {
			pendingRevokeAll = false;
			dealt.clear();
			const all = [...assigned.keys()].map((partition) => ({
				topic,
				partition,
			}));
			return all.length > 0 ? [{ code: REVOKE, partitions: all }] : [];
		}
		const changes = proposeChanges();
		for (const change of changes)
			for (const { partition } of change.partitions)
				if (change.code === ASSIGN) dealt.add(partition);
				else dealt.delete(partition);
		return changes;
	}

	function proposeChanges(): {
		code: number;
		partitions: NativeTopicPartition[];
	}[] {
		const changes: { code: number; partitions: NativeTopicPartition[] }[] = [];
		const unassigned: number[] = [];
		for (let partition = 0; partition < partitionCount; partition++)
			if (!dealt.has(partition)) unassigned.push(partition);
		if (calm) {
			if (unassigned.length > 0)
				changes.push({
					code: ASSIGN,
					partitions: unassigned.map((partition) => ({ topic, partition })),
				});
			return changes;
		}
		const owned = [...dealt];
		if (owned.length > 0 && random.chance(0.06)) {
			const revoked = random.subset(owned);
			if (revoked.length > 0)
				changes.push({
					code: REVOKE,
					partitions: revoked.map((partition) => ({ topic, partition })),
				});
		}
		if (owned.length > 0 && random.chance(0.02)) {
			// Revoked and dealt straight back: KIP-848 moves it away and home within one poll.
			const partition = random.pick(owned);
			changes.push({ code: REVOKE, partitions: [{ topic, partition }] });
			changes.push({ code: ASSIGN, partitions: [{ topic, partition }] });
		}
		if (unassigned.length > 0 && random.chance(0.2)) {
			const dealt = random.subset(unassigned);
			if (dealt.length > 0)
				changes.push({
					code: ASSIGN,
					partitions: dealt.map((partition) => ({ topic, partition })),
				});
		}
		return changes;
	}

	function serveRebalance(change: {
		code: number;
		partitions: NativeTopicPartition[];
	}): void {
		note(
			`rebalance ${change.code === ASSIGN ? "assign" : "revoke"} ${change.partitions.map((p) => p.partition).join(",")}`,
		);
		rebalance?.(nativeError(change.code, "rebalance"), change.partitions);
	}

	function appendRecords(): void {
		if (calm || !random.chance(0.1)) return;
		const partition = random.int(0, partitionCount - 1);
		const count = random.int(1, 5);
		for (let index = 0; index < count; index++)
			slotsOf(partition).push(random.chance(0.8) ? "record" : "marker");
		note(`append p${partition} +${count}`);
	}

	type Item =
		| { kind: "data"; partition: number; offset: number }
		| { kind: "eof"; partition: number; offset: number };

	function fetch(): Item[] {
		const perPartition: Item[][] = [];
		for (const [partition, native] of assigned) {
			if (native.paused) continue;
			const items: Item[] = [];
			const slots = slotsOf(partition);
			const budget = random.int(0, 6);
			let taken = 0;
			while (taken < budget && native.pos < slots.length) {
				const offset = native.pos;
				native.pos += 1;
				if (slots[offset] !== "record") continue;
				items.push({ kind: "data", partition, offset });
				native.eofArmed = true;
				taken += 1;
			}
			if (native.pos >= slots.length && native.eofArmed) {
				native.eofArmed = false;
				let offset = slots.length;
				if (options.weirdOffsets && !calm && random.chance(0.2))
					offset = random.pick([-1, -1001, 0, Math.max(0, offset - 3)]);
				items.push({ kind: "eof", partition, offset });
			}
			if (items.length > 0) perPartition.push(items);
		}
		const merged: Item[] = [];
		while (perPartition.some((items) => items.length > 0)) {
			const nonEmpty = perPartition.filter((items) => items.length > 0);
			merged.push((random.pick(nonEmpty) as Item[]).shift() as Item);
		}
		return merged;
	}

	const native: NativeConsumer = {
		connect(_options, done) {
			done(null);
		},
		disconnect(done) {
			later(() => done(null));
		},
		subscribe() {},
		unsubscribe() {
			leaving = true;
			pendingRevokeAll = true;
		},
		setDefaultConsumeTimeout() {},
		setDefaultIsTimeoutOnlyForFirstMessage() {},
		consume(_count, done) {
			stats.polls += 1;
			flushLateChanges();
			appendRecords();
			const changes = groupChanges();
			const late = options.lateRebalances && !calm && random.chance(0.3);
			if (!late) for (const change of changes) serveRebalance(change);
			const items = fetch();
			let error: NativeKafkaError | null = null;
			if (!calm && random.chance(0.02))
				error = nativeError(LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT);
			const action = externalAction;
			if (action && options.racingSeeks && !calm && random.chance(0.25))
				setTimeout(action, 0);
			function complete(): void {
				for (const item of items) {
					if (item.kind === "data")
						emit("data", {
							topic,
							partition: item.partition,
							offset: item.offset,
							key: null,
							value: Buffer.from(`v${item.offset}`),
							size: 2,
							timestamp: 1,
						});
					else
						emit("partition.eof", {
							topic,
							partition: item.partition,
							offset: item.offset,
						});
				}
				done(error, []);
				if (late) {
					lateChanges.push(...changes);
					setTimeout(flushLateChanges, 0);
				}
			}
			// The poll answers on a later tick, so a seek can land between the fetch and the records.
			setTimeout(complete, random.int(0, 1));
		},
		assign() {
			violate("eager assign under the cooperative protocol");
		},
		unassign() {
			violate("eager unassign under the cooperative protocol");
		},
		incrementalAssign(partitions) {
			for (const {
				partition,
				offset,
			} of partitions as NativeTopicPartitionOffset[]) {
				if (assigned.has(partition))
					violate(`p${partition} assigned while assigned`);
				assigned.set(partition, {
					pos: 0,
					paused: false,
					eofArmed: true,
					cursor: 0,
					deliveredSinceReset: new Set(),
				});
				reposition(partition, offset ?? committed.get(partition) ?? -2);
			}
		},
		incrementalUnassign(partitions) {
			for (const { partition } of partitions) assigned.delete(partition);
		},
		rebalanceProtocol: () => "COOPERATIVE",
		seek(position, _timeout, done) {
			stats.seeks += 1;
			const roll = random.next();
			later(() => {
				if (!assigned.has(position.partition)) {
					done(nativeError(LIBRDKAFKA_ERROR_CODES.ERR__UNKNOWN_PARTITION));
					return;
				}
				if (!calm && roll > 0.95) {
					note(`seek p${position.partition}@${position.offset} outdated`);
					done(nativeError(LIBRDKAFKA_ERROR_CODES.ERR__OUTDATED));
					return;
				}
				reposition(position.partition, position.offset);
				done(
					!calm && roll > 0.85
						? nativeError(LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT)
						: null,
				);
			});
		},
		pause(partitions) {
			for (const { partition } of partitions) {
				const assignedPartition = assigned.get(partition);
				if (assignedPartition) assignedPartition.paused = true;
			}
		},
		resume(partitions) {
			for (const { partition } of partitions) {
				const assignedPartition = assigned.get(partition);
				if (assignedPartition) assignedPartition.paused = false;
			}
		},
		commitCb(offsets, done) {
			stats.commits += 1;
			for (const { partition, offset } of offsets) {
				checkCommit(partition, offset);
				const landed = committed.get(partition);
				if (
					landed !== undefined &&
					offset < landed &&
					assigned.has(partition) &&
					!(appSeekTargets.get(partition) ?? []).some(
						(target) => target <= offset,
					)
				)
					note(
						`commit p${partition}=${offset} issued below the landed ${landed}`,
					);
			}
			const fail = !calm && random.chance(0.08);
			// The coordinator answers one member's commits in the order they were sent.
			commitQueue = commitQueue.then(
				() =>
					new Promise<void>((settled) =>
						later(() => {
							settled();
							if (fail) {
								stats.failedCommits += 1;
								done(
									nativeError(LIBRDKAFKA_ERROR_CODES.ERR_REBALANCE_IN_PROGRESS),
								);
								return;
							}
							for (const { partition, offset } of offsets) {
								committed.set(partition, offset);
								note(`commit p${partition}=${offset}`);
							}
							done(null);
						}),
					),
			);
		},
		committed(partitions, _timeout, done) {
			const fail = !calm && random.chance(0.25);
			later(() => {
				if (fail) {
					done(nativeError(LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT), []);
					return;
				}
				done(
					null,
					partitions.map(({ partition }) => ({
						topic,
						partition,
						offset: committed.get(partition) ?? -1001,
					})),
				);
			});
		},
		getWatermarkOffsets(_topic, partition) {
			const length = slotsOf(partition).length;
			if (calm) return { highOffset: length, lowOffset: 0 };
			const roll = random.int(0, 5);
			if (roll === 0) throw nativeError(LIBRDKAFKA_ERROR_CODES.ERR__STATE);
			if (roll === 1) return { highOffset: -1, lowOffset: -1 };
			if (roll === 2) return { highOffset: -1001, lowOffset: -1001 };
			if (roll === 3) return { highOffset: 0, lowOffset: 0 };
			return { highOffset: length, lowOffset: 0 };
		},
		on(event, listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
		},
	};

	function factory({
		global,
	}: {
		global: Record<string, unknown>;
	}): NativeConsumer {
		rebalance = global.rebalance_cb as NativeRebalanceCallback;
		return native;
	}

	const progress = createProgressTracker();
	/** What consumerLifecycle and commitBatchOffsets read off a batch: offsets that parse, a watermark at or past it. */
	function checkReportedProgress({
		partition,
		highWatermark,
		lastOffset,
		batchSize,
	}: {
		partition: number;
		highWatermark: string;
		lastOffset: string;
		batchSize: number;
	}): void {
		try {
			const high = parseKafkaOffset({ offset: highWatermark });
			const nextOffset = parseKafkaOffset({ offset: lastOffset }) + 1n;
			if (high < nextOffset)
				violate(
					`p${partition} watermark ${high} below the batch's end ${nextOffset}`,
				);
			if (nextOffset > BigInt(slotsOf(partition).length))
				violate(
					`p${partition} progress ${nextOffset} past the log end ${slotsOf(partition).length}`,
				);
			progress.observeHighWatermark({ topic, partition, highWatermark: high });
			progress.advance({ topic, partition, nextOffset });
		} catch (cause) {
			if (batchSize === 0 || lastOffset !== "-1")
				violate(`p${partition} reported unreadable progress: ${String(cause)}`);
		}
	}

	return {
		checkReportedProgress,
		logs,
		committed,
		countAppSeek: (partition: number, target: number) =>
			appSeekTargets.set(partition, [
				...(appSeekTargets.get(partition) ?? []),
				target,
			]),
		assigned,
		handled,
		appSeekFloor,
		violations,
		trace,
		stats,
		factory,
		deliver,
		note,
		isHandled,
		lastRecordOf,
		calm: () => {
			calm = true;
			// A record after the faults: a handler that skipped its last commit commits with the next batch.
			for (const slots of logs) slots.push("record");
		},
		isCalm: () => calm,
		setExternalAction: (action: (() => void) | null) => {
			externalAction = action;
		},
	};
}

type World = ReturnType<typeof createWorld>;

/** The application side: a handler shaped like consumeBatch, failing, seeking and committing at random. */
function createHandler({
	world,
	random,
	consumer,
}: {
	world: World;
	random: Random;
	consumer: () => Consumer;
}) {
	return async function eachBatch(payload: EachBatchPayload): Promise<void> {
		const { batch } = payload;
		const partition = batch.partition;
		world.checkReportedProgress({
			partition,
			highWatermark: batch.highWatermark,
			lastOffset: batch.lastOffset(),
			batchSize: batch.messages.length,
		});
		let previous = -1;
		for (const message of batch.messages) {
			const offset = Number(message.offset);
			if (offset <= previous)
				world.violations.push(`p${partition} batch out of order at ${offset}`);
			previous = offset;
		}
		for (const message of batch.messages) {
			if (payload.isStale() || !payload.isRunning()) break;
			const offset = Number(message.offset);
			world.deliver(partition, offset);
			if (random.chance(0.15)) await Bun.sleep(0);
			if (payload.isStale()) break;
			if (!world.isCalm() && random.chance(0.03))
				throw new Error("handler failed");
			if (!world.isCalm() && random.chance(0.03)) {
				const length = (world.logs[partition] as Slot[]).length;
				const target = random.int(0, length);
				world.note(`app seek p${partition}@${target}`);
				world.countAppSeek(partition, target);
				world.appSeekFloor.set(
					partition,
					Math.max(world.appSeekFloor.get(partition) ?? 0, target),
				);
				consumer().seek({ topic, partition, offset: String(target) });
				break;
			}
			payload.resolveOffset(message.offset);
			(world.handled[partition] as Set<number>).add(offset);
			if (random.chance(0.1)) await payload.heartbeat();
		}
		if (world.isCalm() || random.chance(0.7))
			await payload.commitOffsetsIfNecessary();
	};
}

async function settleWithin<T>(
	promise: Promise<T>,
	ms: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<false>((resolve) => {
		timer = setTimeout(() => resolve(false), ms);
	});
	const settled = await Promise.race([
		promise.then(() => true as const),
		timedOut,
	]);
	clearTimeout(timer);
	return settled;
}

async function runScenario(options: FuzzOptions): Promise<{
	world: World;
	failures: string[];
}> {
	const { random } = options;
	const world = createWorld(options);
	const failures: string[] = [];
	const logLines: string[] = [];
	const sink = {
		error: (line: string) => logLines.push(line),
		warn: (line: string) => logLines.push(line),
		info: () => {},
		debug: () => {},
	};
	const consumer = createLibrdkafkaConsumer({
		ctx: {
			createNative: world.factory,
			nativeClientConfig: {},
			log: createKafkaLog({ clientId: "fuzz", sink }),
		},
		config: { groupId: "fuzz", retry: { initialRetryTime: 1 } },
	});
	const crashes: boolean[] = [];
	consumer.on(consumer.events.END_BATCH_PROCESS, (event) =>
		world.checkReportedProgress(event.payload),
	);
	consumer.on(consumer.events.CRASH, (event) =>
		crashes.push(event.payload.restart),
	);
	world.setExternalAction(() => {
		const owned = [...world.assigned.keys()];
		if (owned.length === 0) return;
		const partition = random.pick(owned);
		try {
			const roll = random.int(0, 2);
			if (roll === 0) {
				const target = random.int(0, (world.logs[partition] as Slot[]).length);
				world.note(`external seek p${partition}@${target}`);
				world.countAppSeek(partition, target);
				world.appSeekFloor.set(
					partition,
					Math.max(world.appSeekFloor.get(partition) ?? 0, target),
				);
				consumer.seek({ topic, partition, offset: String(target) });
			} else if (roll === 1) {
				world.note(`external pause p${partition}`);
				consumer.pause([{ topic, partitions: [partition] }]);
			} else {
				world.note(`external resume p${partition}`);
				consumer.resume([{ topic, partitions: [partition] }]);
			}
		} catch {
			// A consumer leaving refuses seeks and pauses; that is the caller's to hear.
		}
	});
	await consumer.connect();
	await consumer.subscribe({ topics: [topic], fromBeginning: true });
	await consumer.run({
		autoCommit: false,
		eachBatchAutoResolve: false,
		partitionsConsumedConcurrently: random.int(1, 3),
		eachBatch: createHandler({ world, random, consumer: () => consumer }),
	});

	const stopEarly = random.chance(0.15);
	const deadline = performance.now() + 4_000;
	while (world.stats.polls < options.chaosPolls && performance.now() < deadline)
		await Bun.sleep(1);
	if (stopEarly) {
		if (!(await settleWithin(consumer.stop(), 7_000)))
			failures.push("stop() mid-chaos never returned");
		await settleWithin(consumer.disconnect(), 2_000);
		return { world, failures: [...failures, ...world.violations] };
	}

	world.calm();
	world.setExternalAction(null);
	// Calm: everything assigned, nothing fails. Every record must be handled and committed, or the loop wedged.
	const everyPartition = Array.from(
		{ length: options.partitionCount },
		(_, partition) => partition,
	);
	function caughtUp(): boolean {
		// A pause asked for before the partition came back lands with it; the application lifts it here.
		if (
			everyPartition.some((partition) => world.assigned.get(partition)?.paused)
		)
			consumer.resume([{ topic, partitions: everyPartition }]);
		for (let partition = 0; partition < options.partitionCount; partition++) {
			if (!world.assigned.has(partition)) return false;
			const slots = world.logs[partition] as Slot[];
			for (let offset = 0; offset < slots.length; offset++)
				if (slots[offset] === "record" && !world.isHandled(partition, offset))
					return false;
			const last = world.lastRecordOf(partition);
			const required =
				last >= (world.appSeekFloor.get(partition) ?? 0) ? last + 1 : 0;
			if ((world.committed.get(partition) ?? 0) < required) return false;
		}
		return true;
	}
	const calmDeadline = performance.now() + 3_000;
	while (!caughtUp() && performance.now() < calmDeadline) await Bun.sleep(2);
	if (!caughtUp()) {
		const state = [];
		for (let partition = 0; partition < options.partitionCount; partition++) {
			const native = world.assigned.get(partition);
			state.push(
				`p${partition} len=${(world.logs[partition] as Slot[]).length} pos=${native?.pos} paused=${native?.paused} committed=${world.committed.get(partition)} handled=${world.handled[partition]?.size}`,
			);
		}
		failures.push(
			`wedged: never caught up after the faults cleared (${state.join("; ")}; polls=${world.stats.polls}; logs=${logLines.slice(-3).join(" / ")})`,
		);
	}
	const polls = world.stats.polls;
	await Bun.sleep(30);
	if (world.stats.polls === polls) failures.push("the loop stopped polling");
	if (crashes.includes(false)) failures.push("a crash gave the consumer up");
	if (!(await settleWithin(consumer.stop(), 7_000)))
		failures.push("stop() never returned");
	await settleWithin(consumer.disconnect(), 2_000);
	if (logLines.some((line) => line.includes("Kafka consumer loop failed")))
		failures.push("the consume loop threw");
	return { world, failures: [...failures, ...world.violations] };
}

describe("librdkafka consumer runner under random interleavings", () => {
	const seeds = fuzzSeeds({ defaultRuns: 2 });
	for (const [name, variant] of [
		[
			"records, rebalances, failures and handler seeks",
			{ racingSeeks: false, lateRebalances: false, weirdOffsets: false },
		],
		[
			"plus seeks, pauses and resumes racing an in-flight poll",
			{ racingSeeks: true, lateRebalances: false, weirdOffsets: false },
		],
		[
			"plus rebalances heard after the poll's records",
			{ racingSeeks: true, lateRebalances: true, weirdOffsets: false },
		],
		[
			"plus partition ends at -1, -1001, 0 and below what was delivered",
			{ racingSeeks: true, lateRebalances: true, weirdOffsets: true },
		],
	] as const) {
		test(name, async () => {
			const failed: string[] = [];
			for (const seed of seeds) {
				const random = createRandom(seed);
				const { world, failures } = await runScenario({
					random,
					partitionCount: random.int(1, 3),
					chaosPolls: random.int(40, 160),
					...variant,
				});
				if (failures.length > 0 && process.env.FUZZ_TRACE_FILE)
					appendFileSync(
						process.env.FUZZ_TRACE_FILE,
						`seed ${seed} ${name}\n${world.trace.join("\n")}\n\n`,
					);
				if (failures.length > 0)
					failed.push(
						`seed ${seed}: ${failures.slice(0, 3).join(" | ")}\n    trace: ${world.trace.slice(-Number(process.env.FUZZ_TRACE_TAIL ?? 25)).join(" ; ")}`,
					);
			}
			expect(failed).toEqual([]);
		}, 60_000);
	}
});
