import type { ConsumerCrashEvent, EachBatchPayload } from "kafkajs";
import {
	createConsumerGroupConfig,
	TAIL_FETCH_MAX_WAIT_MS,
} from "../../../client/createConsumerGroupConfig.js";
import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import type { KafkaConsumerGroupTimings } from "../../../client/types/kafkaLimits.js";
import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipTail,
	OwnershipTailConfig,
	OwnershipTailContext,
	OwnershipTailListener,
	OwnershipTailState,
	OwnershipTailView,
} from "./types/ownershipTail.js";

const DEFAULT_TAIL_TIMINGS: KafkaConsumerGroupTimings = {
	fetchMaxWaitTimeMs: TAIL_FETCH_MAX_WAIT_MS,
	heartbeatIntervalMs: 3_000,
	sessionTimeoutMs: 30_000,
	rebalanceTimeoutMs: 60_000,
};

/** Connect, join and one fetch that may wait its full idle allowance before the position settles at the log end. */
const TAIL_START_ALLOWANCE_MS = 10_000;

export function ownershipTailStartTimeoutMs({
	startTimeoutMs,
	timings,
}: Pick<OwnershipTailConfig, "startTimeoutMs"> & {
	timings: KafkaConsumerGroupTimings;
}): number {
	return startTimeoutMs ?? TAIL_START_ALLOWANCE_MS + timings.fetchMaxWaitTimeMs;
}

export function createOwnershipTail({
	ctx,
	config,
}: {
	ctx: OwnershipTailContext;
	config: OwnershipTailConfig;
}): OwnershipTail {
	const timings = config.timings ?? DEFAULT_TAIL_TIMINGS;
	const startTimeoutMs = ownershipTailStartTimeoutMs({
		startTimeoutMs: config.startTimeoutMs,
		timings,
	});
	if (!Number.isSafeInteger(startTimeoutMs) || startTimeoutMs <= 0)
		throw new RangeError("Invalid ownership tail start timeout");
	const consumer = ctx.kafka.consumer(
		createConsumerGroupConfig({
			groupId: `${config.groupIdPrefix ?? "autumn-ownership-tail"}-${crypto.randomUUID()}`,
			timings,
		}),
	);
	const state: OwnershipTailState = {
		status: "created",
		listenersByPartition: new Map(),
		viewByPartition: new Map(),
		removeListeners: new Set(),
		stopping: null,
	};

	function report({ cause }: { cause: unknown }): void {
		ctx.onError?.({ cause });
	}

	/** A drain counts only while its author still owns the partition; a claim or release ends it.
	 *  A preparation counts until its author is named, the partition is released, or it announces ready. */
	function remember({ record }: Parameters<OwnershipTailListener>[0]): void {
		const view = state.viewByPartition.get(record.partition);
		if (record.type === "claimed") {
			state.viewByPartition.set(record.partition, {
				owner: record.endpoint,
				activeDrain: null,
				activePreparation: null,
			});
		} else if (record.type === "unowned") {
			state.viewByPartition.set(record.partition, {
				owner: null,
				activeDrain: null,
				activePreparation: null,
			});
		} else if (record.type === "draining" && view?.owner === record.endpoint) {
			view.activeDrain = {
				endpoint: record.endpoint,
				successor: record.successor,
			};
		} else if (record.type === "preparing") {
			const preparation = { endpoint: record.endpoint };
			if (view) view.activePreparation = preparation;
			else
				state.viewByPartition.set(record.partition, {
					owner: null,
					activeDrain: null,
					activePreparation: preparation,
				});
		} else if (
			record.type === "ready" &&
			view?.activePreparation?.endpoint === record.endpoint
		) {
			view.activePreparation = null;
		}
	}

	function readView({
		partition,
	}: {
		partition: number;
	}): OwnershipTailView | null {
		const view = state.viewByPartition.get(partition);
		return view ? { ...view } : null;
	}

	function deliver({
		partition,
		message,
	}: {
		partition: number;
		message: { offset: string; key: Buffer | null; value: Buffer | null };
	}): void {
		let entry: Parameters<OwnershipTailListener>[0];
		try {
			entry = {
				partition,
				offset: parseKafkaOffset({ offset: message.offset }),
				record: ownershipTopic.parse(message),
			};
		} catch (cause) {
			// One bad record must not stall every handoff on the worker; the listener's timeout covers it.
			report({ cause });
			return;
		}
		remember(entry);
		const listeners = state.listenersByPartition.get(partition);
		if (!listeners || listeners.size === 0) return;
		for (const listener of [...listeners]) {
			try {
				listener(entry);
			} catch (cause) {
				report({ cause });
			}
		}
	}

	async function eachBatch({
		batch,
		resolveOffset,
		heartbeat,
		isRunning,
		isStale,
	}: EachBatchPayload): Promise<void> {
		if (batch.topic !== config.topic) return;
		for (const message of batch.messages) {
			if (!isRunning() || isStale()) return;
			deliver({ partition: batch.partition, message });
			resolveOffset(message.offset);
			await heartbeat();
		}
	}

	function onCrash(event: ConsumerCrashEvent): void {
		report({ cause: event.payload.error });
	}

	async function start(): Promise<void> {
		if (state.status !== "created")
			throw new Error(`Ownership tail cannot start while ${state.status}`);
		state.status = "starting";
		const firstFetch = Promise.withResolvers<void>();
		function onFetch(): void {
			firstFetch.resolve();
		}
		function onStartTimeout(): void {
			firstFetch.reject(new Error("Ownership tail did not fetch in time"));
		}
		// The timeout can fire while connect or subscribe is still pending, before
		// the promise is awaited; without an observer that is an unhandled rejection.
		async function observeFirstFetch(): Promise<void> {
			try {
				await firstFetch.promise;
			} catch {
				// Surfaces where start awaits it.
			}
		}
		void observeFirstFetch();
		state.removeListeners
			.add(consumer.on(consumer.events.CRASH, onCrash))
			.add(consumer.on(consumer.events.FETCH, onFetch));
		const timer = setTimeout(onStartTimeout, startTimeoutMs);
		try {
			await consumer.connect();
			// From the log end: a listener is always registered before the record it waits for exists.
			await consumer.subscribe({
				topics: [config.topic],
				fromBeginning: false,
			});
			await consumer.run({ autoCommit: false, eachBatch });
			await firstFetch.promise;
			// A stop that landed meanwhile wins; started must not overwrite it.
			if (state.status === "starting") state.status = "started";
		} catch (cause) {
			await stop();
			throw cause;
		} finally {
			clearTimeout(timer);
		}
	}

	function tailPartition({
		partition,
		onRecord,
		signal,
	}: {
		partition: number;
		onRecord: OwnershipTailListener;
		signal: AbortSignal;
	}): void {
		if (state.status !== "started")
			throw new Error(`Ownership tail cannot follow while ${state.status}`);
		if (signal.aborted) return;
		const listeners =
			state.listenersByPartition.get(partition) ??
			new Set<OwnershipTailListener>();
		listeners.add(onRecord);
		state.listenersByPartition.set(partition, listeners);
		function remove(): void {
			signal.removeEventListener("abort", remove);
			state.removeListeners.delete(remove);
			listeners.delete(onRecord);
			if (listeners.size === 0) state.listenersByPartition.delete(partition);
		}
		signal.addEventListener("abort", remove);
		// Tracked so stop() detaches from the caller's signal, which may outlive the tail.
		state.removeListeners.add(remove);
	}

	function stop(): Promise<void> {
		if (state.stopping) return state.stopping;
		const started = state.status !== "created";
		state.status = "stopped";
		for (const remove of [...state.removeListeners]) remove();
		state.removeListeners.clear();
		state.listenersByPartition.clear();
		state.stopping = started ? closeTail() : Promise.resolve();
		return state.stopping;
	}

	async function closeTail(): Promise<void> {
		try {
			await consumer.stop();
		} finally {
			await consumer.disconnect();
		}
	}

	return { start, stop, tailPartition, readView };
}
