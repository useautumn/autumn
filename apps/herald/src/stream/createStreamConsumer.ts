import {
	createConsumerGroupConfig,
	createMeteringConsumer,
	createProgressTracker,
	type KafkaConsumerGroupTimings,
	type MeteringRecordFailure,
	type MeteringRecordSlice,
	type MeteringStaleRecord,
	parseTrustedMeteringRecord,
} from "@autumn/kafka";
import type { AutumnLogger } from "@autumn/logging";
import { type PostgresExecutor, readPartitionProgress } from "@autumn/postgres";
import type {
	ConsumerCrashEvent,
	ConsumerGroupJoinEvent,
	Kafka,
} from "kafkajs";
import type {
	JobHealth,
	JobMembership,
} from "../slot/types/heraldHeartbeat.js";
import { landRecords } from "./landRecords/landRecords.js";
import { seedGroupPlaces } from "./seedGroupPlaces.js";
import {
	HeraldStoppedMidSliceError,
	type RunningStreamConsumer,
	type StreamConsumer,
} from "./types/streamConsumer.js";

// Small on purpose: herald is a follower, and one slow partition must not hold the others.
const PARTITIONS_CONSUMED_CONCURRENTLY = 8;
/** One store round trip per slice; the resolve and heartbeat after it bound what a lost partition can repeat. */
const RECORDS_PER_SLICE = 500;
const CONSUMER_TIMINGS: KafkaConsumerGroupTimings = {
	fetchMaxWaitTimeMs: 250,
	heartbeatIntervalMs: 3000,
	rebalanceTimeoutMs: 60000,
	sessionTimeoutMs: 30000,
};

/** Runs one job over the balance log with a consumer group of its own. Everything Kafka lives here, none of it in a job. */
export function createStreamConsumer({
	ctx,
	config,
	streamConsumer,
}: {
	ctx: {
		kafka: Pick<Kafka, "consumer" | "admin">;
		logger: AutumnLogger;
		/** Where partition_progress lives; without it a fence is known only once read from the log. */
		db?: PostgresExecutor;
		/** The consumer died and kafkajs will not restart it: the process must end so the task is replaced. */
		onCrashed: (params: { job: string; cause: unknown }) => void;
	};
	config: {
		topic: string;
		groupIdPrefix: string;
		recordsPerSlice?: number;
		/** Tests only: a short session so an evicted member is seen in seconds. */
		timings?: KafkaConsumerGroupTimings;
	};
	streamConsumer: StreamConsumer;
}): RunningStreamConsumer {
	const groupId = `${config.groupIdPrefix}-${streamConsumer.name}`;
	const consumer = ctx.kafka.consumer(
		createConsumerGroupConfig({
			groupId,
			timings: config.timings ?? CONSUMER_TIMINGS,
		}),
	);
	const stopping = new AbortController();
	const job = streamConsumer.name;
	const progress = createProgressTracker();
	let membership: JobMembership = "idle";
	let assignedPartitions: number[] = [];

	/** A record that cannot be read is dropped, loudly: one bad record must never hold its partition. */
	function onRecordError({
		topic,
		partition,
		offset,
		cause,
	}: MeteringRecordFailure): void {
		ctx.logger.error(
			{
				error: cause,
				type: "herald_record_skipped",
				data: { job, topic, partition, offset },
			},
			"Herald skipped a record it could not read",
		);
	}

	function onStaleRecord({
		position,
		ownerEpoch,
		fence,
	}: MeteringStaleRecord): void {
		ctx.logger.warn(
			{
				type: "herald_record_stale",
				data: {
					job,
					topic: position.topic,
					partition: position.partition,
					offset: position.offset.toString(),
					ownerEpoch: ownerEpoch.toString(),
					fenceEpoch: fence.epoch.toString(),
					fenceOffset: fence.offset.toString(),
				},
			},
			"Herald dropped a stale owner's record",
		);
	}

	// Stopped mid-slice: thrown so nothing of the slice is resolved; the runner is already stopping, so it ends there.
	async function applyRecords(slice: MeteringRecordSlice): Promise<void> {
		const settled = await landRecords({
			ctx: {
				logger: ctx.logger,
				signal: stopping.signal,
				heartbeat: slice.heartbeat,
			},
			job: streamConsumer,
			records: slice.applications,
		});
		if (!settled) throw new HeraldStoppedMidSliceError();
	}

	function readResumeOffset(): null {
		return null;
	}

	const { db } = ctx;
	const readOwnerFence = db
		? async (position: { topic: string; partition: number }) =>
				(await readPartitionProgress({ ctx: { db }, ...position }))
					?.ownerFence ?? null
		: undefined;

	const topicConsumer = createMeteringConsumer({
		ctx: {
			consumer,
			progress,
			handler: {
				readResumeOffset,
				applyRecords,
				onRecordError,
				onStaleRecord,
				readOwnerFence,
				// Herald follows a log its writer validated, so only the shape its readers lean on is checked.
				parseRecord: parseTrustedMeteringRecord,
			},
		},
		config: {
			topic: config.topic,
			partitionsConsumedConcurrently: PARTITIONS_CONSUMED_CONCURRENTLY,
			recordsPerSlice: config.recordsPerSlice ?? RECORDS_PER_SLICE,
		},
	});

	function onCrash(event: ConsumerCrashEvent): void {
		if (event.payload.restart) return;
		ctx.onCrashed({ job, cause: event.payload.error });
	}
	function onGroupJoin(event: ConsumerGroupJoinEvent): void {
		assignedPartitions = event.payload.memberAssignment[config.topic] ?? [];
		membership = "joined";
		ctx.logger.info(
			{
				type: "herald_group_joined",
				data: { job, groupId, partitions: assignedPartitions.length },
			},
			"Herald job joined its group",
		);
	}

	/** What the heartbeat reports: in the group or not, and how far behind the log this member is. */
	function health(): JobHealth {
		let maxLagRecords: number | null = null;
		for (const partition of assignedPartitions) {
			const { consumedNextOffset, highWatermark } = progress.readProgress({
				topic: config.topic,
				partition,
			});
			if (consumedNextOffset === null || highWatermark === null) continue;
			const lag = Number(highWatermark - consumedNextOffset);
			maxLagRecords = Math.max(maxLagRecords ?? 0, lag);
		}
		return {
			name: job,
			membership,
			partitions: assignedPartitions.length,
			maxLagRecords,
		};
	}
	function onRebalancing(): void {
		ctx.logger.info(
			{ type: "herald_group_rebalancing", data: { job, groupId } },
			"Herald job's group is rebalancing",
		);
	}

	async function start(): Promise<void> {
		membership = "joining";
		await seedGroupPlaces({
			ctx: { admin: ctx.kafka.admin(), logger: ctx.logger },
			groupId,
			topic: config.topic,
		});
		consumer.on(consumer.events.CRASH, onCrash);
		consumer.on(consumer.events.GROUP_JOIN, onGroupJoin);
		consumer.on(consumer.events.REBALANCING, onRebalancing);
		await topicConsumer.start();
	}

	/** The runner is told first so it stops fetching; the abort then only cuts short a wait on the store. */
	async function stop(): Promise<void> {
		membership = "leaving";
		const stopped = topicConsumer.stop();
		stopping.abort(new Error("Herald stopping"));
		try {
			await stopped;
		} finally {
			membership = "idle";
			assignedPartitions = [];
		}
	}

	return { start, stop, health };
}
