import type { ConsumerCrashEvent, EachBatchPayload } from "kafkajs";
import { createConsumerGroupConfig } from "../../../client/createConsumerGroupConfig.js";
import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import { ownershipTopic } from "../ownershipTopic.js";
import type {
	OwnershipTail,
	OwnershipTailConfig,
	OwnershipTailContext,
	OwnershipTailListener,
	OwnershipTailState,
} from "./types/ownershipTail.js";

export function createOwnershipTail({
	ctx,
	config,
}: {
	ctx: OwnershipTailContext;
	config: OwnershipTailConfig;
}): OwnershipTail {
	const startTimeoutMs = config.startTimeoutMs ?? 10_000;
	if (!Number.isSafeInteger(startTimeoutMs) || startTimeoutMs <= 0)
		throw new RangeError("Invalid ownership tail start timeout");
	const consumer = ctx.kafka.consumer(
		createConsumerGroupConfig({
			groupId: `${config.groupIdPrefix ?? "autumn-ownership-tail"}-${crypto.randomUUID()}`,
			timings: config.timings ?? {
				fetchMaxWaitTimeMs: 250,
				heartbeatIntervalMs: 3_000,
				sessionTimeoutMs: 30_000,
				rebalanceTimeoutMs: 60_000,
			},
		}),
	);
	const state: OwnershipTailState = {
		status: "created",
		listenersByPartition: new Map(),
		removeListeners: new Set(),
		stopping: null,
	};

	function report({ cause }: { cause: unknown }): void {
		ctx.onError?.({ cause });
	}

	function deliver({
		partition,
		message,
	}: {
		partition: number;
		message: { offset: string; key: Buffer | null; value: Buffer | null };
	}): void {
		const listeners = state.listenersByPartition.get(partition);
		if (!listeners || listeners.size === 0) return;
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

	return { start, stop, tailPartition };
}
