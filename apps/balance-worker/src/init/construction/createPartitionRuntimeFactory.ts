import { createProducerSession } from "@autumn/kafka";
import { createMutationPublisher } from "../../kafka/createMutationPublisher.js";
import { createOwnershipPublisher } from "../../kafka/createOwnershipPublisher.js";
import { createWorkerProducer } from "../../kafka/createWorkerProducer.js";
import {
	createOwnerEpochCell,
	type OwnerEpochCell,
} from "../../kafka/ownerEpochCell.js";
import { commitSummaries } from "../../logging/commitSummaries.js";
import { createPartitionCommitLogging } from "../../logging/createPartitionCommitLogging.js";
import { kafkaRequestTimings } from "../../logging/kafkaRequestTimings.js";
import type { PartitionOwnershipPublication } from "../../partitions/types/partitions.js";
import { createPartitionRuntime } from "../../runtime/createPartitionRuntime.js";
import type {
	ConstructedPartitionRuntime,
	KafkaOwnedPartitionRuntimeFactory,
	PartitionRuntimeFactoryConfig,
	PartitionRuntimeFactoryContext,
	PartitionRuntimeFactoryInput,
} from "../types/partitionRuntimeFactory.js";
import {
	assertKafkaBalanceWorkerTimings,
	assertRecoveryDrainOutlastsProducerRetries,
	createWorkerProducerConfig,
} from "../workerConfig.js";

export function createPartitionRuntimeFactory({
	ctx,
	config,
}: {
	ctx: PartitionRuntimeFactoryContext;
	config: PartitionRuntimeFactoryConfig;
}): KafkaOwnedPartitionRuntimeFactory {
	assertKafkaBalanceWorkerTimings({ timings: config.timings });
	assertRecoveryDrainOutlastsProducerRetries({
		producerLimits: config.producerLimits,
		timings: config.timings,
	});
	if (!config.ownership.topic.trim() || !config.ownership.endpoint.trim()) {
		throw new Error("Ownership topic and advertised endpoint are required");
	}
	if (
		!Number.isSafeInteger(config.trackReceiptRetentionMs) ||
		config.trackReceiptRetentionMs <= 0
	) {
		throw new RangeError(
			"trackReceiptRetentionMs must be a positive safe integer",
		);
	}
	function createRuntime({
		topic,
		partition,
		follower,
		preparation,
		recentCommands,
		producedOffsets,
		ownerEpoch: epochCell = createOwnerEpochCell(),
	}: PartitionRuntimeFactoryInput): ConstructedPartitionRuntime {
		const session = createProducerSession({
			ctx: { kafka: ctx.kafka, onRequest: kafkaRequestTimings.record },
			config: createWorkerProducerConfig({
				deploymentEnvironment: config.deploymentEnvironment,
				topic,
				partition,
				limits: config.producerLimits,
				mode: config.commit?.mode,
			}),
		});
		const producer = createWorkerProducer({
			ctx: { session, ownerEpoch: epochCell.read },
			config: { topic, partition },
		});
		const ownership = createOwnershipPublisher({
			ctx: {
				session: producer,
				partitionOffsets: ctx.ownershipOffsets,
				handoff: ctx.ownershipHandoff,
			},
			config: { ...config.ownership, partition },
		});
		// The epoch a claim hands back is what this writer's records are stamped with.
		const { publication, ownerEpoch } = trackOwnerEpoch({
			publication: ownership,
			cell: epochCell,
		});
		const appender = createMutationPublisher({
			ctx: {
				producer,
				producedOffsets,
				partitionLoad: ctx.partitionLoad,
				commit: config.commit,
				ownerEpoch,
				commandOffsets: ctx.commandOffsets,
				logger: ctx.logger,
			},
			config: config.commands,
		});
		const commitLogging = createPartitionCommitLogging({
			ctx: {
				appender,
				stateStore: ctx.stateStore,
				logger: ctx.logger,
				summaries: commitSummaries,
			},
			config: {
				deployment: config.deploymentEnvironment,
				endpoint: config.ownership.endpoint,
			},
		});
		const runtime = createPartitionRuntime({
			ctx: {
				stateStore: commitLogging.stateStore,
				logger: ctx.logger,
				db: ctx.db,
				catalogCache: ctx.catalogCache,
				checkpointMaintenance: ctx.checkpointMaintenance,
				bootstrapper: ctx.bootstrapper,
				follower,
				preparationFollower: preparation,
				producer,
				appender: commitLogging.appender,
				partitionResolver: ctx.partitionResolver,
				receiptPolicy: {
					retentionMs: config.trackReceiptRetentionMs,
					now: Date.now,
				},
				recentCommands,
				commitPositions: ctx.commitPositions?.sinkFor({ partition }),
				subjectSnapshotsConfig: ctx.subjectSnapshotsConfig,
				dbControl: ctx.dbControl,
			},
			config: {
				topic,
				partition,
				writerLimits: config.writerLimits,
				recoveryDrainTimeoutMs: config.timings.recoveryDrainTimeoutMs,
			},
		});
		return { runtime, publication };
	}
	return createRuntime;
}

/** An acknowledgement can arrive after a later claim was already followed, so the epoch only moves forward. */
function recordNewerEpoch({
	cell,
	routeEpoch,
}: {
	cell: OwnerEpochCell;
	routeEpoch: string;
}): void {
	const held = cell.read();
	if (held === undefined || BigInt(routeEpoch) > BigInt(held))
		cell.write(routeEpoch);
}

/** Remembers the route epoch of the latest claim this worker won for the partition, however it won it. */
function trackOwnerEpoch({
	publication,
	cell,
}: {
	publication: PartitionOwnershipPublication;
	cell: OwnerEpochCell;
}): {
	publication: PartitionOwnershipPublication;
	ownerEpoch(): string | undefined;
} {
	async function claim(
		...params: Parameters<PartitionOwnershipPublication["claim"]>
	): ReturnType<PartitionOwnershipPublication["claim"]> {
		const claimed = await publication.claim(...params);
		recordNewerEpoch({ cell, routeEpoch: claimed.routeEpoch });
		return claimed;
	}
	async function awaitClaim(
		...params: Parameters<PartitionOwnershipPublication["awaitClaim"]>
	): ReturnType<PartitionOwnershipPublication["awaitClaim"]> {
		const claimed = await publication.awaitClaim(...params);
		recordNewerEpoch({ cell, routeEpoch: claimed.routeEpoch });
		return claimed;
	}
	function followClaims(
		...params: Parameters<
			NonNullable<PartitionOwnershipPublication["followClaims"]>
		>
	): void {
		const [{ signal, onClaim }] = params;
		function recordNewer(claim: { routeEpoch: string }): void {
			recordNewerEpoch({ cell, routeEpoch: claim.routeEpoch });
			onClaim(claim);
		}
		publication.followClaims?.({ signal, onClaim: recordNewer });
	}
	return {
		publication: { ...publication, claim, awaitClaim, followClaims },
		ownerEpoch: cell.read,
	};
}
