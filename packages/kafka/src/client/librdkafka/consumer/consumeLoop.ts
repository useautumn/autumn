import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import { isKafkaAccessRefusal } from "../../../consumer/consumerErrors.js";
import { createBatchRun, highWatermarkOf } from "./batchRun.js";
import { emitConsumerEvent, emitGroupChange } from "./consumerEvents.js";
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
const OFFSET_BEGINNING = -2;

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
}> {
	const byKey = new Map<string, FetchedPartition>();
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
				seekEpoch: scope.state.seekEpoch.get(key) ?? 0,
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
	try {
		native.consume(MAX_RECORDS_PER_CONSUME, consumed);
	} catch (cause) {
		done.resolve(cause as NativeKafkaError);
	}
	const error = await done.promise;
	scope.state.collector = null;
	return { partitions: [...byKey.values()], error };
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
	const key = partitionKeyOf({ topic, partition });
	scope.state.seekEpoch.set(key, (scope.state.seekEpoch.get(key) ?? 0) + 1);
	scope.state.skippedFrom.delete(key);
	function sought(error: NativeKafkaError | null | undefined): void {
		if (!error) return;
		scope.log("warn", "Kafka consumer seek failed", {
			topic,
			partition,
			offset,
			error: String(error),
		});
	}
	native.seek({ topic, partition, offset }, 0, sought);
}

function isLeaseLoss(cause: unknown): boolean {
	return cause instanceof KafkaConsumerLeaseLostError;
}

/** A failed handler ends the batch and every other in flight; kafkajs then rejoined from the last commit. */
function crash({
	scope,
	cause,
}: {
	scope: ConsumerRunnerScope;
	cause: unknown;
}): void {
	const { state } = scope;
	if (state.restartPending) return;
	state.restartPending = {
		cause: cause instanceof Error ? cause : new Error(String(cause)),
		terminal: false,
	};
	for (const key of state.assigned.keys())
		state.generation.set(key, (state.generation.get(key) ?? 0) + 1);
}

async function runBatch({
	scope,
	native,
	topic,
	partition,
	messages,
}: {
	scope: ConsumerRunnerScope;
	native: NativeConsumer;
	topic: string;
	partition: number;
	messages: NativeMessage[];
}): Promise<void> {
	const run = scope.state.run;
	if (!run) return;
	const firstOffset = messages[0]?.offset ?? 0;
	const batch = createBatchRun({ scope, topic, partition, messages });
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
			crash({ scope, cause });
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
	async function flush(): Promise<void> {
		const messages = pending;
		pending = [];
		if (messages.length > 0)
			await runBatch({ scope, native, topic, partition, messages });
	}
	for (const item of fetched.items) {
		if (!state.assigned.has(key) || state.restartPending || !state.running)
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
		await flush();
		// An empty partition's end says nothing kafkajs ever reported: there is no last offset.
		if (item.offset <= 0) continue;
		emitConsumerEvent({
			scope,
			type: "consumer.end_batch_process",
			payload: {
				topic,
				partition,
				highWatermark: highWatermarkOf({ scope, topic, partition }),
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
async function readCommitted({
	native,
	partitions,
}: {
	native: NativeConsumer;
	partitions: { topic: string; partition: number }[];
}): Promise<{ topic: string; partition: number; offset: number }[]> {
	const done =
		Promise.withResolvers<
			{ topic: string; partition: number; offset: number }[]
		>();
	function read(
		error: NativeKafkaError | null,
		offsets: { topic: string; partition: number; offset: number }[],
	): void {
		done.resolve(error ? [] : offsets);
	}
	native.committed(partitions, 10_000, read);
	return done.promise;
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
	emitConsumerEvent({
		scope,
		type: "consumer.crash",
		payload: { groupId: scope.config.groupId, error: cause, restart },
	});
	if (!restart) return false;
	await Bun.sleep(scope.config.retry?.initialRetryTime ?? 300);
	const partitions = [...scope.state.assigned.values()];
	if (partitions.length > 0) {
		const committed = await readCommitted({ native, partitions });
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
		const { partitions, error } = await consumeChunk({ scope, native });
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
				await Bun.sleep(100);
			}
		}
		emitConsumerEvent({
			scope,
			type: "consumer.fetch",
			payload: { numberOfBatches: partitions.length },
		});
		if (state.running && !state.restartPending)
			await deliverConcurrently({ scope, native, partitions });
		const pendingRestart = state.restartPending;
		if (!pendingRestart || !state.running) continue;
		const restarted = await restartFromCommits({
			scope,
			native,
			...pendingRestart,
		});
		if (!restarted) {
			state.running = false;
			state.restartPending = null;
		}
	}
}
