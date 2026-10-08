import type {
	Consumer,
	ConsumerConfig,
	ConsumerEventByName,
	ConsumerEventName,
	ConsumerRunConfig,
	ConsumerSubscribeTopics,
	OffsetsByTopicPartition,
	TopicPartitionOffset,
} from "../../types/kafkaWire.js";
import { ConsumerEventNames } from "../../types/kafkaWire.js";
import type { KafkaLog } from "../kafkaLog.js";
import { type NativeDone, settleNative } from "../settleNative.js";
import { commitTopicOffsets } from "./batchRun.js";
import { failTerminally, runConsumeLoop, seekNative } from "./consumeLoop.js";
import { handleRebalance } from "./handleRebalance.js";
import { nativeConsumerConfigOf } from "./nativeConsumerConfig.js";
import { registerNativeConsumer } from "./nativeConsumerRegistry.js";
import { KafkaConsumerNotRunningError } from "./runnerErrors.js";
import type {
	NativeConsumer,
	NativeConsumerFactory,
	NativeKafkaError,
	NativeMessage,
	NativeTopicPartition,
} from "./types/nativeConsumer.js";
import {
	type ConsumerListeners,
	type ConsumerRunnerScope,
	type ConsumerRunnerState,
	partitionKeyOf,
} from "./types/runnerState.js";

/** How long `stop()` serves the group's revocation after leaving before it gives up waiting. */
const LEAVE_TIMEOUT_MS = 5_000;
/** How long one poll waits for a first record; it also bounds how long `stop()` waits for the loop. */
const CONSUME_POLL_MS = 100;

function emptyListeners(): ConsumerListeners {
	return {
		"consumer.group_join": new Set(),
		"consumer.rebalancing": new Set(),
		"consumer.crash": new Set(),
		"consumer.fetch": new Set(),
		"consumer.end_batch_process": new Set(),
	};
}

function partitionsOf({
	state,
	topics,
}: {
	state: ConsumerRunnerState;
	topics: { topic: string; partitions?: number[] }[];
}): NativeTopicPartition[] {
	const selected: NativeTopicPartition[] = [];
	for (const { topic, partitions } of topics) {
		if (partitions) {
			for (const partition of partitions) selected.push({ topic, partition });
			continue;
		}
		for (const assigned of state.assigned.values())
			if (assigned.topic === topic) selected.push(assigned);
	}
	return selected;
}

/**
 * A kafkajs-shaped consumer on librdkafka's native consumer: batches per partition, the kafkajs events our
 * consumers listen to, rewinds and crash restarts the way kafkajs did them, and KIP-848 underneath.
 */
export function createLibrdkafkaConsumer({
	ctx,
	config,
}: {
	ctx: {
		createNative: NativeConsumerFactory;
		nativeClientConfig: Record<string, unknown>;
		log: KafkaLog;
	};
	config: ConsumerConfig;
}): Consumer {
	const state: ConsumerRunnerState = {
		native: null,
		topics: [],
		fromBeginning: true,
		run: null,
		running: false,
		leaving: false,
		loop: null,
		assigned: new Map(),
		generation: new Map(),
		seekEpoch: new Map(),
		paused: new Set(),
		skippedFrom: new Map(),
		pendingSeeks: new Map(),
		assigning: new Set(),
		resolved: new Map(),
		committed: new Map(),
		restartPending: null,
		collector: null,
		listeners: emptyListeners(),
	};
	function log(
		level: "warn" | "error",
		message: string,
		fields?: object,
	): void {
		ctx.log.write(level, message, { groupId: config.groupId, ...fields });
	}
	const scope: ConsumerRunnerScope = { config, state, log };

	function createNative({
		fromBeginning,
	}: {
		fromBeginning: boolean;
	}): NativeConsumer {
		let native: NativeConsumer | null = null;
		function onRebalance(
			error: NativeKafkaError,
			partitions: NativeTopicPartition[],
		): void {
			if (native) handleRebalance({ scope, native, error, partitions });
		}
		native = ctx.createNative({
			global: {
				...ctx.nativeClientConfig,
				...nativeConsumerConfigOf({ config }),
				rebalance_cb: onRebalance,
				event_cb: true,
			},
			topic: { "auto.offset.reset": fromBeginning ? "earliest" : "latest" },
		});
		function onData(message: NativeMessage): void {
			state.collector?.onData(message);
		}
		function onEof(eof: {
			topic: string;
			partition: number;
			offset: number;
		}): void {
			state.collector?.onEof(eof);
		}
		function onLog(entry: {
			severity: number;
			fac: string;
			message: string;
		}): void {
			ctx.log.writeNative(entry);
		}
		function onError(error: NativeKafkaError): void {
			if (error.isFatal) {
				failTerminally({ scope, cause: error });
				return;
			}
			log("warn", "Kafka consumer error; librdkafka retries it", {
				code: error.code,
				error: error.message,
			});
		}
		native.on("data", onData);
		native.on("partition.eof", onEof);
		native.on("event.log", onLog);
		native.on("event.error", onError);
		return native;
	}

	async function connect(): Promise<void> {
		state.leaving = false;
	}

	async function subscribe({
		topics,
		fromBeginning = false,
	}: ConsumerSubscribeTopics): Promise<void> {
		if (!state.native) {
			state.fromBeginning = fromBeginning;
			const native = createNative({ fromBeginning });
			function connectNative(done: NativeDone): void {
				native.connect({}, done);
			}
			await settleNative(connectNative);
			// Wait for the first record only, then take what is already fetched: a poll never sits on a partial batch.
			native.setDefaultConsumeTimeout(CONSUME_POLL_MS);
			native.setDefaultIsTimeoutOnlyForFirstMessage(true);
			state.native = native;
		}
		state.topics = [...new Set([...state.topics, ...topics])];
		state.native.subscribe(state.topics);
	}

	async function run(runConfig: ConsumerRunConfig): Promise<void> {
		const native = state.native;
		if (!native)
			throw new KafkaConsumerNotRunningError({
				operation: "run before subscribe",
			});
		if (state.running) throw new Error("Kafka consumer is already running");
		state.run = runConfig;
		state.running = true;
		state.loop = runLoop(native);
	}

	async function runLoop(native: NativeConsumer): Promise<void> {
		try {
			await runConsumeLoop({ scope, native });
		} catch (cause) {
			state.running = false;
			log("error", "Kafka consumer loop failed", { error: String(cause) });
		}
	}

	function requireNative(operation: string): NativeConsumer {
		if (!state.native || state.leaving)
			throw new KafkaConsumerNotRunningError({ operation });
		return state.native;
	}

	function seek({ topic, partition, offset }: TopicPartitionOffset): void {
		const native = requireNative("seek");
		const key = partitionKeyOf({ topic, partition });
		if (state.assigning.has(key) || !state.assigned.has(key)) {
			state.pendingSeeks.set(key, Number(offset));
			state.seekEpoch.set(key, (state.seekEpoch.get(key) ?? 0) + 1);
			return;
		}
		seekNative({ scope, native, topic, partition, offset: Number(offset) });
	}

	function pause(topics: { topic: string; partitions?: number[] }[]): void {
		const native = requireNative("pause");
		const partitions = partitionsOf({ state, topics });
		const live: NativeTopicPartition[] = [];
		for (const partition of partitions) {
			const key = partitionKeyOf(partition);
			state.paused.add(key);
			if (state.assigned.has(key) && !state.assigning.has(key))
				live.push(partition);
		}
		if (live.length > 0) native.pause(live);
	}

	function resume(topics: { topic: string; partitions?: number[] }[]): void {
		const native = requireNative("resume");
		const live: NativeTopicPartition[] = [];
		for (const partition of partitionsOf({ state, topics })) {
			const key = partitionKeyOf(partition);
			state.paused.delete(key);
			if (state.assigned.has(key) && !state.assigning.has(key))
				live.push(partition);
		}
		if (live.length === 0) return;
		native.resume(live);
		for (const { topic, partition } of live) {
			const skipped = state.skippedFrom.get(
				partitionKeyOf({ topic, partition }),
			);
			if (skipped !== undefined)
				seekNative({ scope, native, topic, partition, offset: skipped });
		}
	}

	async function commitOffsets(offsets: TopicPartitionOffset[]): Promise<void> {
		requireNative("commit offsets");
		const topics: OffsetsByTopicPartition["topics"] = [];
		for (const { topic, partition, offset } of offsets)
			topics.push({ topic, partitions: [{ partition, offset }] });
		await commitTopicOffsets({ scope, offsets: { topics } });
	}

	/** Leaves the group and serves the revocation that follows, so successors are assigned now, not at close. */
	async function leaveGroup(native: NativeConsumer): Promise<void> {
		state.leaving = true;
		native.unsubscribe();
		const deadline = performance.now() + LEAVE_TIMEOUT_MS;
		while (state.assigned.size > 0 && performance.now() < deadline) {
			const served = Promise.withResolvers<void>();
			function onServed(): void {
				served.resolve();
			}
			native.consume(1, onServed);
			await served.promise;
		}
	}

	async function stop(): Promise<void> {
		state.running = false;
		await state.loop;
		state.loop = null;
		const native = state.native;
		if (native && !state.leaving) await leaveGroup(native);
	}

	async function disconnect(): Promise<void> {
		await stop();
		const native = state.native;
		state.native = null;
		state.topics = [];
		state.assigned.clear();
		if (!native) return;
		function disconnectNative(done: NativeDone): void {
			native?.disconnect(done);
		}
		await settleNative(disconnectNative);
	}

	function on<Name extends ConsumerEventName>(
		event: Name,
		listener: (event: ConsumerEventByName[Name]) => void,
	): () => void {
		const listeners = state.listeners[event] as Set<typeof listener>;
		listeners.add(listener);
		function remove(): void {
			listeners.delete(listener);
		}
		return remove;
	}

	const consumer: Consumer = {
		connect,
		subscribe,
		run,
		commitOffsets,
		seek,
		pause,
		resume,
		stop,
		disconnect,
		events: ConsumerEventNames,
		on,
	};
	function readNative(): NativeConsumer | null {
		return state.native;
	}
	registerNativeConsumer({ consumer, readNative });
	return consumer;
}
