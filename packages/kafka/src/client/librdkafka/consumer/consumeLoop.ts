import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import { isKafkaAccessRefusal } from "../../../consumer/consumerErrors.js";
import {
	commitTopicOffsets,
	createBatchRun,
	highWatermarkOf,
} from "./batchRun.js";
import { emitConsumerEvent, emitGroupChange } from "./consumerEvents.js";
import { requestRestart } from "./requestRestart.js";
import { KafkaConsumerLeaseLostError } from "./runnerErrors.js";
import type {
	NativeConsumer,
	NativeKafkaError,
	NativeMessage,
} from "./types/nativeConsumer.js";
import {
	type ConsumerRunnerScope,
	partitionKeyOf,
} from "./types/runnerState.js";

/** At most this many records per partition reach one `eachBatch`, the most our handlers commit at once. */
export const MAX_RECORDS_PER_CONSUME = 500;
/** The wait after a poll that found nothing: the most a record or a rebalance waits to be served. */
export const IDLE_POLL_MS = 5;
const OFFSET_BEGINNING = -2;
const COMMITTED_TIMEOUT_MS = 10_000;
/** A native seek answers within its 10ms wait; one that never does must not stop the consumer for good. */
const SEEK_SETTLE_TIMEOUT_MS = 5_000;
const MAX_COMMITTED_BACKOFF_MS = 5_000;

/** A wait inside the loop that `stop` cuts short, so a stopping consumer never sits out a backoff or an idle pause. */
export function sleepUnlessStopped({
	scope,
	ms,
}: {
	scope: ConsumerRunnerScope;
	ms: number;
}): Promise<void> {
	const signal = scope.state.wake.signal;
	if (signal.aborted) return Promise.resolve();
	const slept = Promise.withResolvers<void>();
	function wake(): void {
		clearTimeout(timer);
		slept.resolve();
	}
	function elapse(): void {
		signal.removeEventListener("abort", wake);
		slept.resolve();
	}
	const timer = setTimeout(elapse, ms);
	signal.addEventListener("abort", wake, { once: true });
	return slept.promise;
}

type PartitionItem =
	| { kind: "message"; message: NativeMessage }
	| { kind: "eof"; offset: number };

type FetchedPartition = {
	topic: string;
	partition: number;
	seekEpoch: number;
	items: PartitionItem[];
};

/** One `consume()`: records and partition-end markers in the order librdkafka delivered them. */
async function consumeChunk({
	scope,
	native,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
}): Promise<{
	partitions: FetchedPartition[];
	error: NativeKafkaError | null;
	dispatchedEpochs: Map<string, number>;
}> {
	const byKey = new Map<string, FetchedPartition>();
	// A record popped by this poll was fetched under the seeks made before it, not those made while it ran.
	const dispatchedEpochs = new Map(scope.state.seekEpoch);
	function itemsOf({
		topic,
		partition,
	}: {
		topic: string;
		partition: number;
	}): PartitionItem[] {
		const key = partitionKeyOf({ topic, partition });
		let fetched = byKey.get(key);
		if (!fetched) {
			fetched = {
				topic,
				partition,
				seekEpoch: dispatchedEpochs.get(key) ?? 0,
				items: [],
			};
			byKey.set(key, fetched);
		}
		return fetched.items;
	}
	function onData(message: NativeMessage): void {
		itemsOf(message).push({ kind: "message", message });
	}
	function onEof(eof: {
		topic: string;
		partition: number;
		offset: number;
	}): void {
		itemsOf(eof).push({ kind: "eof", offset: eof.offset });
	}
	scope.state.collector = { onData, onEof };
	const done = Promise.withResolvers<NativeKafkaError | null>();
	function consumed(error: NativeKafkaError | null): void {
		done.resolve(error ?? null);
	}
	scope.state.lastPollAt = performance.now();
	scope.state.loopPollInFlight = true;
	try {
		native.consume(MAX_RECORDS_PER_CONSUME, consumed);
	} catch (cause) {
		done.resolve(cause as NativeKafkaError);
	}
	const error = await done.promise;
	scope.state.loopPollInFlight = false;
	scope.state.collector = null;
	return { partitions: [...byKey.values()], error, dispatchedEpochs };
}

/** A seek made while a poll ran races it: what the poll returned for that partition may be from either side
 *  of the seek, so all of it is dropped and the seek asked for again, now that no poll holds records. */
function reseekRacedPartitions({
	scope,
	native,
	partitions,
	dispatchedEpochs,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	partitions: FetchedPartition[];
	dispatchedEpochs: Map<string, number>;
}): FetchedPartition[] {
	const { state } = scope;
	const kept: FetchedPartition[] = [];
	for (const fetched of partitions) {
		const key = partitionKeyOf(fetched);
		const target = state.seekTargets.get(key);
		const raced =
			(state.seekEpoch.get(key) ?? 0) !== (dispatchedEpochs.get(key) ?? 0);
		if (!raced) {
			kept.push(fetched);
			continue;
		}
		if (
			target !== undefined &&
			state.assigned.has(key) &&
			!state.assigning.has(key)
		)
			seekNative({ scope, native, ...fetched, offset: target });
	}
	return kept;
}

/** librdkafka sets a seek's barrier only when its pool thread runs it; until then a poll can still return
 *  records from before the seek, so no poll starts while a seek is on its way. */
export async function settleSeeks({
	scope,
}: {
	scope: ConsumerRunnerScope;
}): Promise<void> {
	const { inflightSeeks } = scope.state;
	const deadline = performance.now() + SEEK_SETTLE_TIMEOUT_MS;
	while (inflightSeeks.size > 0) {
		const remainingMs = deadline - performance.now();
		if (remainingMs <= 0) {
			scope.log(
				"warn",
				"Kafka consumer seeks went unanswered; polling anyway",
				{
					seeks: inflightSeeks.size,
				},
			);
			inflightSeeks.clear();
			return;
		}
		await Promise.race([
			Promise.all([...inflightSeeks]),
			Bun.sleep(remainingMs),
		]);
	}
}

/** What a failed batch leaves behind: kafkajs rewound the partition to its last resolved record. */
function rewindUnresolved({
	scope,
	native,
	topic,
	partition,
	firstOffset,
	lastResolved,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	topic: string;
	partition: number;
	firstOffset: number;
	lastResolved: bigint | null;
}): void {
	const offset =
		lastResolved === null ? firstOffset : Number(lastResolved + 1n);
	seekNative({ scope, native, topic, partition, offset });
}

export function seekNative({
	scope,
	native,
	topic,
	partition,
	offset,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	topic: string;
	partition: number;
	offset: number;
}): void {
	const { state } = scope;
	const key = partitionKeyOf({ topic, partition });
	const epoch = (state.seekEpoch.get(key) ?? 0) + 1;
	state.seekEpoch.set(key, epoch);
	state.seekTargets.set(key, offset);
	state.skippedFrom.delete(key);
	state.deliveredNext.delete(key);
	const settled = Promise.withResolvers<void>();
	state.inflightSeeks.add(settled.promise);
	function finish(): void {
		state.inflightSeeks.delete(settled.promise);
		settled.resolve();
	}
	function sought(error: NativeKafkaError | null | undefined): void {
		try {
			reportSeek({ error });
		} finally {
			finish();
		}
	}
	function reportSeek({
		error,
	}: {
		error: NativeKafkaError | null | undefined;
	}): void {
		// A timed-out seek has set its barrier and is still applied; only the wait for it ended.
		if (!error || error.code === LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT) return;
		// A pause or resume right after the seek supersedes it and librdkafka drops it; ask again.
		if (
			error.code === LIBRDKAFKA_ERROR_CODES.ERR__OUTDATED &&
			state.seekEpoch.get(key) === epoch &&
			state.assigned.has(key) &&
			state.native === native
		) {
			seekNative({ scope, native, topic, partition, offset });
			return;
		}
		scope.log("warn", "Kafka consumer seek failed", {
			topic,
			partition,
			offset,
			error: String(error),
		});
	}
	try {
		native.seek({ topic, partition, offset }, 0, sought);
	} catch (cause) {
		finish();
		throw cause;
	}
}

function isLeaseLoss(cause: unknown): boolean {
	return cause instanceof KafkaConsumerLeaseLostError;
}

async function runBatch({
	scope,
	native,
	topic,
	partition,
	messages,
	endOffset,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	topic: string;
	partition: number;
	messages: NativeMessage[];
	endOffset?: number;
}): Promise<void> {
	const run = scope.state.run;
	if (!run) return;
	const firstOffset = messages[0]?.offset ?? 0;
	const batch = createBatchRun({
		scope,
		topic,
		partition,
		messages,
		endOffset,
	});
	const lastMessage = messages.at(-1);
	if (lastMessage)
		scope.state.deliveredNext.set(
			partitionKeyOf({ topic, partition }),
			Number(lastMessage.offset) + 1,
		);
	try {
		if (run.eachBatch) {
			await run.eachBatch(batch.payload);
			if (run.eachBatchAutoResolve !== false && !batch.payload.isStale()) {
				const last = batch.payload.batch.lastOffset();
				batch.payload.resolveOffset(last);
			}
		} else if (run.eachMessage) {
			for (const message of batch.payload.batch.messages) {
				if (batch.payload.isStale() || !batch.payload.isRunning()) break;
				await run.eachMessage({
					topic,
					partition,
					message,
					heartbeat: batch.payload.heartbeat,
					pause: batch.payload.pause,
				});
				batch.payload.resolveOffset(message.offset);
			}
		}
		if (run.autoCommit !== false && run.eachMessage)
			await batch.payload.commitOffsetsIfNecessary();
	} catch (cause) {
		if (!isLeaseLoss(cause) && !batch.payload.isStale())
			requestRestart({ scope, cause });
	}
	emitConsumerEvent({
		scope,
		type: "consumer.end_batch_process",
		payload: {
			topic,
			partition,
			highWatermark: batch.payload.batch.highWatermark,
			batchSize: messages.length,
			lastOffset: batch.payload.batch.lastOffset(),
		},
	});
	const lastOffset = BigInt(messages.at(-1)?.offset ?? 0);
	const resolved = batch.lastResolved();
	if (batch.payload.isStale() || batch.seeked()) return;
	if (resolved === null || resolved < lastOffset)
		rewindUnresolved({
			scope,
			native,
			topic,
			partition,
			firstOffset,
			lastResolved: resolved,
		});
}

/** kafkajs saw the markers closing a batch inside that batch and committed past them with it. librdkafka
 *  hides them, so a partition its handler had settled is committed through them here. */
async function commitPastMarkers({
	scope,
	topic,
	partition,
	endOffset,
}: {
	scope: ConsumerRunnerScope;
	topic: string;
	partition: number;
	endOffset: number;
}): Promise<void> {
	const { resolved, committed, deliveredNext } = scope.state;
	const key = partitionKeyOf({ topic, partition });
	const delivered = deliveredNext.get(key);
	if (delivered === undefined || delivered >= endOffset) return;
	const settled = String(delivered);
	if (committed.get(key) !== settled || resolved.get(key) !== settled) return;
	resolved.set(key, String(endOffset));
	try {
		await commitTopicOffsets({
			scope,
			offsets: {
				topics: [
					{ topic, partitions: [{ partition, offset: String(endOffset) }] },
				],
			},
		});
	} catch (cause) {
		// The next batch's commit carries it instead.
		scope.log("warn", "Kafka commit past transaction markers failed", {
			topic,
			partition,
			offset: endOffset,
			error: String(cause),
		});
	}
}

async function deliverPartition({
	scope,
	native,
	fetched,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	fetched: FetchedPartition;
}): Promise<void> {
	const { state } = scope;
	const { topic, partition } = fetched;
	const key = partitionKeyOf({ topic, partition });
	let pending: NativeMessage[] = [];
	async function flush(endOffset?: number): Promise<void> {
		const messages = pending;
		pending = [];
		if (messages.length > 0)
			await runBatch({ scope, native, topic, partition, messages, endOffset });
	}
	for (const item of fetched.items) {
		if (
			!state.assigned.has(key) ||
			state.restartPending ||
			!state.running ||
			state.leaving
		)
			return;
		if ((state.seekEpoch.get(key) ?? 0) !== fetched.seekEpoch) return;
		if (state.paused.has(key)) {
			const first =
				pending[0]?.offset ??
				(item.kind === "message" ? item.message.offset : undefined);
			if (first !== undefined && !state.skippedFrom.has(key))
				state.skippedFrom.set(key, first);
			return;
		}
		if (item.kind === "message") {
			pending.push(item.message);
			continue;
		}
		if (pending.length > 0) {
			await flush(item.offset);
			continue;
		}
		// An empty partition's end says nothing kafkajs ever reported: there is no last offset.
		if (item.offset <= 0) continue;
		await commitPastMarkers({
			scope,
			topic,
			partition,
			endOffset: item.offset,
		});
		emitConsumerEvent({
			scope,
			type: "consumer.end_batch_process",
			payload: {
				topic,
				partition,
				highWatermark: highWatermarkOf({
					scope,
					topic,
					partition,
					floor: item.offset,
				}),
				batchSize: 0,
				lastOffset: String(item.offset - 1),
			},
		});
	}
	await flush();
}

async function deliverConcurrently({
	scope,
	native,
	partitions,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	partitions: FetchedPartition[];
}): Promise<void> {
	const limit = Math.max(
		1,
		scope.state.run?.partitionsConsumedConcurrently ?? 1,
	);
	const queue = [...partitions];
	async function worker(): Promise<void> {
		for (let fetched = queue.shift(); fetched; fetched = queue.shift())
			await deliverPartition({ scope, native, fetched });
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, queue.length) }, worker),
	);
}

async function decideRestart({
	scope,
	cause,
	terminal,
}: {
	scope: ConsumerRunnerScope;
	cause: Error;
	terminal: boolean;
}): Promise<boolean> {
	if (terminal) return false;
	const restartOnFailure = scope.config.retry?.restartOnFailure;
	if (!restartOnFailure) return true;
	try {
		return await restartOnFailure(cause);
	} catch {
		return false;
	}
}

/** Committed offsets for the partitions, or none when the coordinator will not say: the rewind is best effort. */
type CommittedOffset = { topic: string; partition: number; offset: number };

function readCommittedOnce({
	native,
	partitions,
}: {
	native: NativeConsumer;
	partitions: { topic: string; partition: number }[];
}): Promise<CommittedOffset[]> {
	const done = Promise.withResolvers<CommittedOffset[]>();
	function read(
		error: NativeKafkaError | null,
		offsets: CommittedOffset[],
	): void {
		if (error) done.reject(error);
		else done.resolve(offsets);
	}
	native.committed(partitions, COMMITTED_TIMEOUT_MS, read);
	return done.promise;
}

/** The rewind is what keeps a failed batch's records; resuming without it would skip them, so it waits. */
async function readCommitted({
	scope,
	native,
	partitions,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	partitions: { topic: string; partition: number }[];
}): Promise<CommittedOffset[] | null> {
	let backoffMs = scope.config.retry?.initialRetryTime ?? 300;
	while (scope.state.running && scope.state.native === native) {
		try {
			return await readCommittedOnce({ native, partitions });
		} catch (cause) {
			scope.log(
				"warn",
				"Kafka consumer could not read committed offsets; retrying",
				{
					error: String(cause),
					retryInMs: backoffMs,
				},
			);
			await sleepUnlessStopped({ scope, ms: backoffMs });
			backoffMs = Math.min(backoffMs * 2, MAX_COMMITTED_BACKOFF_MS);
		}
	}
	return null;
}

/** kafkajs disconnected a consumer it would not restart, so a restart joined on a new client; a native client
 *  that raised a fatal error is dead for good, and reusing it would leave the consumer up but owning nothing. */
function giveUp({ scope }: { scope: ConsumerRunnerScope }): void {
	scope.state.running = false;
	scope.state.restartPending = null;
	scope.state.gaveUp = true;
}

async function restartFromCommits({
	scope,
	native,
	cause,
	terminal,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	cause: Error;
	/** The broker refused this client: kafkajs gave such a group up for good. */
	terminal: boolean;
}): Promise<boolean> {
	const restart = await decideRestart({ scope, cause, terminal });
	// Settled before the crash is heard, so an owner restarting from its listener finds the loop over.
	if (!restart) giveUp({ scope });
	emitConsumerEvent({
		scope,
		type: "consumer.crash",
		payload: { groupId: scope.config.groupId, error: cause, restart },
	});
	if (!restart) return false;
	await sleepUnlessStopped({
		scope,
		ms: scope.config.retry?.initialRetryTime ?? 300,
	});
	const partitions = [...scope.state.assigned.values()];
	if (partitions.length > 0) {
		const committed = await readCommitted({ scope, native, partitions });
		if (!committed) return true;
		for (const { topic, partition, offset } of committed) {
			if (offset >= 0) seekNative({ scope, native, topic, partition, offset });
			else if (scope.state.fromBeginning)
				seekNative({
					scope,
					native,
					topic,
					partition,
					offset: OFFSET_BEGINNING,
				});
		}
	}
	scope.state.restartPending = null;
	emitGroupChange({ scope });
	return true;
}

/** kafkajs reported a fetch only once one was answered. Until every assigned partition has had a record or
 *  its end back, "latest" may still resolve past a record produced now, and a tail would never see it. */
export function everyPartitionFetched({
	scope,
}: {
	scope: ConsumerRunnerScope;
}): boolean {
	const { assigned, fetched, paused } = scope.state;
	if (assigned.size === 0) return false;
	for (const key of assigned.keys())
		if (!fetched.has(key) && !paused.has(key)) return false;
	return true;
}

/** A refusal or a fatal client error: the consumer ends, and its owner decides whether to come back. */
export function failTerminally({
	scope,
	cause,
}: {
	scope: ConsumerRunnerScope;
	cause: Error;
}): void {
	const { state } = scope;
	if (state.restartPending?.terminal) return;
	state.restartPending = { cause, terminal: true };
	for (const key of state.assigned.keys())
		state.generation.set(key, (state.generation.get(key) ?? 0) + 1);
}

/** Errors librdkafka recovers from on its own (a broker restart, a timeout) are only logged. */
function isTerminalConsumeError(error: NativeKafkaError): boolean {
	if (error.isFatal || error.code === LIBRDKAFKA_ERROR_CODES.ERR__FATAL)
		return true;
	return (
		isKafkaAccessRefusal({ cause: error }) ||
		error.code === LIBRDKAFKA_ERROR_CODES.ERR__AUTHENTICATION
	);
}

export async function runConsumeLoop({
	scope,
	native,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
}): Promise<void> {
	const { state } = scope;
	while (state.running) {
		await settleSeeks({ scope });
		const polled = await consumeChunk({ scope, native });
		const { error } = polled;
		const partitions = reseekRacedPartitions({ scope, native, ...polled });
		if (error && error.code !== LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT) {
			if (isTerminalConsumeError(error))
				failTerminally({ scope, cause: error });
			else {
				scope.log(
					"warn",
					"Kafka consumer fetch failed; librdkafka retries it",
					{
						code: error.code,
						error: error.message,
					},
				);
				await sleepUnlessStopped({ scope, ms: 100 });
			}
		}
		const answered =
			!error || error.code === LIBRDKAFKA_ERROR_CODES.ERR__TIMED_OUT;
		if (answered && partitions.length === 0)
			await sleepUnlessStopped({ scope, ms: IDLE_POLL_MS });
		for (const { topic, partition } of partitions)
			state.fetched.add(partitionKeyOf({ topic, partition }));
		// An empty or failed poll says nothing of the brokers; reporting it would hide a stalled fetch.
		if (answered && partitions.length > 0 && everyPartitionFetched({ scope }))
			emitConsumerEvent({
				scope,
				type: "consumer.fetch",
				payload: { numberOfBatches: partitions.length },
			});
		if (state.running && !state.restartPending)
			await deliverConcurrently({ scope, native, partitions });
		const pendingRestart = state.restartPending;
		if (!pendingRestart || !state.running) continue;
		// An evicted member's partitions are revoked by the next poll; rewinding first would replay what it lost.
		if (pendingRestart.pollFirst) {
			pendingRestart.pollFirst = false;
			continue;
		}
		const { cause, terminal } = pendingRestart;
		await restartFromCommits({ scope, native, cause, terminal });
	}
}
