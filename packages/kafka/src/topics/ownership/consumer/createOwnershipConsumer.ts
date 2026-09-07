import type { ConsumerCrashEvent } from "kafkajs";
import { createConsumerGroupConfig } from "../../../client/createConsumerGroupConfig.js";
import { parseKafkaOffset } from "../../../client/kafkaOffsetUtils.js";
import { createProgressTracker } from "../../../consumer/createProgressTracker.js";
import { createTopicConsumer } from "../../../consumer/createTopicConsumer.js";
import type {
	TopicRecord,
	TopicResumePosition,
} from "../../../consumer/types/consumer.js";
import {
	failOwnershipConsumer,
	refreshOwnership,
	startOwnershipConsumer,
	stopOwnershipConsumer,
} from "./ownershipConsumerLifecycle.js";
import { applyOwnershipMessage } from "./ownershipReplay.js";
import type {
	OwnershipConsumer,
	OwnershipConsumerConfig,
	OwnershipConsumerState,
	OwnershipKafka,
} from "./types/ownershipConsumer.js";

export function createOwnershipConsumer({
	ctx: dependencies,
	config,
}: {
	ctx: { kafka: OwnershipKafka };
	config: OwnershipConsumerConfig;
}): OwnershipConsumer {
	const catchUpTimeoutMs = config.catchUpTimeoutMs ?? 10_000;
	if (
		!Number.isSafeInteger(catchUpTimeoutMs) ||
		catchUpTimeoutMs <= 0 ||
		catchUpTimeoutMs > 2_147_483_647
	)
		throw new RangeError("Invalid ownership catch-up timeout");
	const groupId = `${config.groupIdPrefix ?? "autumn-ownership"}-${crypto.randomUUID()}`;
	const consumer = dependencies.kafka.consumer({
		...createConsumerGroupConfig({
			groupId,
			timings: config.timings ?? {
				fetchMaxWaitTimeMs: 250,
				heartbeatIntervalMs: 3_000,
				sessionTimeoutMs: 10_000,
				rebalanceTimeoutMs: 30_000,
			},
		}),
		retry: { restartOnFailure: stopAfterFailure },
	});
	const admin = dependencies.kafka.admin();
	const progress = createProgressTracker();
	const state: OwnershipConsumerState = {
		status: "created",
		owners: new Map(),
		lastAppliedOffsets: new Map(),
		lifetime: new AbortController(),
	};

	function readResumeOffset(position: TopicResumePosition): bigint | null {
		return progress.read(position);
	}
	function applyRecord(input: TopicRecord): void {
		if (state.lifetime.signal.aborted) return;
		try {
			applyOwnershipMessage({
				state,
				message: input.message,
				partition: input.partition,
				offset: parseKafkaOffset({ offset: input.message.offset }),
			});
		} catch (cause) {
			failOwnershipConsumer({ state, cause });
			throw cause;
		}
	}
	function onCrash(event: ConsumerCrashEvent): void {
		failOwnershipConsumer({ state, cause: event.payload.error });
	}
	const topicConsumer = createTopicConsumer({
		ctx: { consumer, progress, handler: { readResumeOffset, applyRecord } },
		config: { topic: config.topic },
	});
	const ctx = {
		consumer,
		admin,
		topicConsumer,
		progress,
		topic: config.topic,
		catchUpTimeoutMs,
	};

	function start(): Promise<void> {
		if (state.status !== "created")
			throw new Error(`Ownership consumer cannot start while ${state.status}`);
		state.status = "starting";
		state.removeCrashListener = consumer.on(consumer.events.CRASH, onCrash);
		state.starting = startOwnershipConsumer({ ctx, state });
		return state.starting;
	}
	function refresh(): Promise<void> {
		if (state.status !== "started")
			throw new Error(
				`Ownership consumer cannot refresh while ${state.status}`,
				{ cause: state.lifetime.signal.reason },
			);
		state.refreshing ??= refreshOwnership({ ctx, state });
		return state.refreshing;
	}
	function findOwner({ partition }: { partition: number }) {
		if (state.status !== "started")
			throw new Error(
				`Ownership consumer cannot look up owners while ${state.status}`,
				{ cause: state.lifetime.signal.reason },
			);
		const owner = state.owners.get(partition);
		return owner ? { ...owner } : undefined;
	}
	function stop(): Promise<void> {
		if (state.stopping) return state.stopping;
		state.status = "stopped";
		state.lifetime.abort(new Error("Ownership consumer stopped"));
		state.stopping = stopOwnershipConsumer({ ctx, state });
		return state.stopping;
	}
	return { start, stop, findOwner, refresh };
}

async function stopAfterFailure(): Promise<boolean> {
	return false;
}
