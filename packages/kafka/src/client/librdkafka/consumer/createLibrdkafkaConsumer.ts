import { LIBRDKAFKA_ERROR_CODES } from "@autumn/librdkafka";
import type {
	Consumer,
	ConsumerConfig,
	ConsumerEventByName,
	ConsumerEventName,
	ConsumerRunConfig,
	ConsumerSubscribeTopics,
	GroupProtocol,
	OffsetsByTopicPartition,
	TopicPartitionOffset,
} from "../../types/kafkaWire.js";
import { ConsumerEventNames } from "../../types/kafkaWire.js";
import type { KafkaLog } from "../kafkaLog.js";
import { type NativeDone, settleNative } from "../settleNative.js";
import { commitTopicOffsets } from "./batchRun.js";
import {
	everyPartitionFetched,
	failTerminally,
	IDLE_POLL_MS,
	runConsumeLoop,
	seekNative,
	settleSeeks,
} from "./consumeLoop.js";
import { emitConsumerEvent } from "./consumerEvents.js";
import { createFetchLiveness } from "./fetchLiveness.js";
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
/** How long a restart waits for a given-up client to close before abandoning it. */
const RETIRE_TIMEOUT_MS = 10_000;
/** How long `stop` waits for the consume loop to notice it; past this it leaves the group and closes without it. */
export const STOP_LOOP_TIMEOUT_MS = 10_000;
/** A poll never waits natively: a blocking one holds a native pool thread, and idle consumers starve every commit. */
const CONSUME_POLL_MS = 0;

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
		/** The client's protocol, for a group that does not name its own. */
		groupProtocol?: GroupProtocol;
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
		wake: new AbortController(),
		assigned: new Map(),
		generation: new Map(),
		seekEpoch: new Map(),
		seekTargets: new Map(),
		inflightSeeks: new Set(),
		lastPollAt: performance.now(),
		paused: new Set(),
		skippedFrom: new Map(),
		pendingSeeks: new Map(),
		fetched: new Set(),
		deliveredNext: new Map(),
		assigning: new Set(),
		resolved: new Map(),
		committed: new Map(),
		gaveUp: false,
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
			if (!native) return;
			if (state.native === native)
				handleRebalance({ scope, native, error, partitions });
			else releaseClosing({ native, error, partitions });
		}
		native = ctx.createNative({
			global: {
				...ctx.nativeClientConfig,
				...nativeConsumerConfigOf({
					config,
					defaultProtocol: ctx.groupProtocol,
				}),
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
			if (error.isFatal && state.native === native) {
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
		const intervalMs = config.statisticsIntervalMs;
		if (intervalMs) {
			const liveness = createFetchLiveness({ intervalMs });
			function onStatistics({ message }: { message: string }): void {
				if (state.native !== native || !state.running || state.restartPending)
					return;
				try {
					if (
						!everyPartitionFetched({ scope }) ||
						!liveness.answeredSince({ state, statistics: message })
					)
						return;
				} catch (cause) {
					log("warn", "Kafka consumer statistics could not be read", {
						error: String(cause),
					});
					return;
				}
				emitConsumerEvent({
					scope,
					type: "consumer.fetch",
					payload: { numberOfBatches: 0 },
				});
			}
			native.on("event.stats", onStatistics);
		}
		return native;
	}

	/** A client being closed gives its partitions back so the close can finish; the runner's state is not its. */
	function releaseClosing({
		native,
		error,
		partitions,
	}: {
		native: NativeConsumer;
		error: NativeKafkaError;
		partitions: NativeTopicPartition[];
	}): void {
		if (error.code === LIBRDKAFKA_ERROR_CODES.ERR__ASSIGN_PARTITIONS) return;
		try {
			if (native.rebalanceProtocol() === "COOPERATIVE")
				native.incrementalUnassign(partitions);
			else native.unassign();
		} catch (cause) {
			log(
				"warn",
				"Kafka consumer could not release a closing client's partitions",
				{
					error: String(cause),
				},
			);
		}
	}

	async function connect(): Promise<void> {
		state.leaving = false;
	}

	async function subscribe({
		topics,
		fromBeginning = false,
	}: ConsumerSubscribeTopics): Promise<void> {
		if (state.gaveUp) await retireNative();
		if (!state.native) {
			state.fromBeginning = fromBeginning;
			const native = createNative({ fromBeginning });
			function connectNative(done: NativeDone): void {
				native.connect({}, done);
			}
			await settleNative(connectNative);
			// Take what is already fetched; the runner waits between empty polls.
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
		state.wake = new AbortController();
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

	/** Closes the client a given-up loop left behind and forgets its group state; the subscription is rebuilt. */
	async function retireNative(): Promise<void> {
		await state.loop;
		state.loop = null;
		const native = state.native;
		state.native = null;
		state.gaveUp = false;
		state.topics = [];
		await settleSeeks({ scope });
		if (native) await closeNative(native);
		state.restartPending = null;
		for (const key of state.assigned.keys())
			state.generation.set(key, (state.generation.get(key) ?? 0) + 1);
		state.inflightSeeks.clear();
		for (const partitionState of [
			state.seekTargets,
			state.assigned,
			state.paused,
			state.skippedFrom,
			state.pendingSeeks,
			state.fetched,
			state.deliveredNext,
			state.assigning,
			state.resolved,
			state.committed,
		])
			partitionState.clear();
	}

	/** A dead client may never answer its close; the restart goes ahead on a new one regardless. */
	async function closeNative(native: NativeConsumer): Promise<void> {
		function disconnectNative(done: NativeDone): void {
			native.disconnect(done);
		}
		async function giveUpWaiting(): Promise<"timed out"> {
			await Bun.sleep(RETIRE_TIMEOUT_MS);
			return "timed out";
		}
		try {
			const outcome = await Promise.race([
				settleNative(disconnectNative),
				giveUpWaiting(),
			]);
			if (outcome === "timed out")
				log("warn", "Kafka consumer close timed out; abandoning the client");
		} catch (cause) {
			log("warn", "Kafka consumer close failed", { error: String(cause) });
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
			state.seekTargets.set(key, Number(offset));
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
			await Bun.sleep(IDLE_POLL_MS);
		}
	}

	/** A loop parked on something that never answers must not hold the process: the group is left and the client closed regardless. */
	async function awaitLoop(): Promise<void> {
		const loop = state.loop;
		if (!loop) return;
		async function loopEnded(): Promise<"ended"> {
			await loop;
			return "ended";
		}
		if (
			(await raceTimeout({ work: loopEnded(), ms: STOP_LOOP_TIMEOUT_MS })) ===
			"ended"
		)
			return;
		log(
			"error",
			"Kafka consumer loop did not stop; leaving the group without it",
			{
				timeoutMs: STOP_LOOP_TIMEOUT_MS,
				pollAgoMs: Math.round(performance.now() - state.lastPollAt),
				inflightSeeks: state.inflightSeeks.size,
				restartPending: state.restartPending !== null,
			},
		);
	}

	/** Leaving serves the revocation through polls; one that never answers must not hold the stop past its bound. */
	async function leaveGroupWithin({
		native,
	}: {
		native: NativeConsumer;
	}): Promise<void> {
		async function left(): Promise<"left"> {
			await leaveGroup(native);
			return "left";
		}
		const bound = LEAVE_TIMEOUT_MS + STOP_LOOP_TIMEOUT_MS;
		if ((await raceTimeout({ work: left(), ms: bound })) === "left") return;
		log("error", "Kafka consumer did not finish leaving; closing without it", {
			timeoutMs: bound,
		});
	}

	async function leave(): Promise<void> {
		const native = state.native;
		if (!native || state.leaving || state.gaveUp) return;
		await leaveGroupWithin({ native });
	}

	async function stop(): Promise<void> {
		state.running = false;
		state.wake.abort();
		await awaitLoop();
		state.loop = null;
		const native = state.native;
		if (native && !state.leaving && !state.gaveUp)
			await leaveGroupWithin({ native });
	}

	async function disconnect(): Promise<void> {
		await stop();
		const native = state.native;
		state.native = null;
		state.topics = [];
		state.assigned.clear();
		if (!native) return;
		// A seek runs on a native pool thread against the client the close frees.
		await settleSeeks({ scope });
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
		leave,
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

/** The bound's timer is cleared once the work wins: a pending one would hold a stopping process open for its full length. */
async function raceTimeout<T>({
	work,
	ms,
}: {
	work: Promise<T>;
	ms: number;
}): Promise<T | "timed out"> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	function timeOut(resolve: (value: "timed out") => void): void {
		timer = setTimeout(resolve, ms, "timed out");
	}
	try {
		return await Promise.race([work, new Promise<"timed out">(timeOut)]);
	} finally {
		clearTimeout(timer);
	}
}
