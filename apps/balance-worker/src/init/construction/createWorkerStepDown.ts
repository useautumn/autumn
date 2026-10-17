import type { EdgeConfigLocation } from "@autumn/edge-config";
import {
	BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
	BALANCE_WORKER_STEP_DOWN_PEER_LIVE_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
	BALANCE_WORKER_STEP_DOWN_PERMIT_TTL_MS,
	BALANCE_WORKER_STEP_DOWN_PERMITS,
	BALANCE_WORKER_STEP_DOWN_S3_TIMEOUT_MS,
} from "@autumn/env/balanceWorkerConstants";
import type { AutumnLogger } from "@autumn/logging";
import { S3Client } from "@aws-sdk/client-s3";
import type {
	SlotHeartbeat,
	SlotWorkReading,
} from "../../blueGreen/types/slotHeartbeat.js";
import { createAdminBucketObjects } from "../../external/s3/createAdminBucketObjects.js";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import { createOwnNetworkMonitor } from "../../health/ownNetwork/createOwnNetworkMonitor.js";
import type { PartitionSendWatches } from "../../health/ownNetwork/types/partitionSendWatches.js";
import { createStepDownController } from "../../health/stepDown/createStepDownController.js";
import { createStepDownPermits } from "../../health/stepDown/createStepDownPermits.js";
import { readFleetHeartbeats } from "../../health/stepDown/readFleetHeartbeats.js";
import type { StepDownController } from "../../health/stepDown/types/stepDownController.js";
import type { Partitions } from "../../partitions/types/partitions.js";

type WorkerStepDownContext = {
	sendWatches: PartitionSendWatches;
	partitions: Pick<Partitions, "stepDown" | "isSteppedDown" | "hasAssignment">;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	adminBucket?: EdgeConfigLocation;
};

type WorkerStepDownConfig = {
	deployment: string;
	endpoint: string;
	fleetId: string | null;
};

export function createWorkerStepDown({
	ctx,
	config,
}: {
	ctx: WorkerStepDownContext;
	config: WorkerStepDownConfig;
}): { readWork(): SlotWorkReading; start(): void; stop(): void } {
	const ownNetwork = createOwnNetworkMonitor({
		ctx: { sends: ctx.sendWatches },
	});
	const controller = createController({ ctx, config, ownNetwork });

	function readWork(): SlotWorkReading {
		return {
			lastSendAckAt: ctx.sendWatches.readLastAckAt(),
			ownNetwork: ownNetwork.verdict().state,
			steppedDown: ctx.partitions.isSteppedDown(),
		};
	}

	function start(): void {
		ownNetwork.start();
		controller?.start();
	}

	function stop(): void {
		void controller?.stop();
		ownNetwork.stop();
	}

	return { readWork, start, stop };
}

function readPeersOf({
	objects,
	fleetId,
}: {
	objects: AdminBucketObjects;
	fleetId: string;
}): () => Promise<SlotHeartbeat[]> {
	function readPeers(): Promise<SlotHeartbeat[]> {
		return readFleetHeartbeats({
			ctx: { objects },
			fleetId,
			modifiedAfter: Date.now() - BALANCE_WORKER_STEP_DOWN_PEER_LIVE_MS,
		});
	}
	return readPeers;
}

function createController({
	ctx,
	config,
	ownNetwork,
}: {
	ctx: WorkerStepDownContext;
	config: WorkerStepDownConfig;
	ownNetwork: ReturnType<typeof createOwnNetworkMonitor>;
}): StepDownController | undefined {
	const { adminBucket } = ctx;
	const { fleetId } = config;
	if (!adminBucket || !fleetId) return undefined;
	const objects = createAdminBucketObjects({
		ctx: {
			client: new S3Client({ region: adminBucket.region, maxAttempts: 1 }),
		},
		config: {
			bucket: adminBucket.bucket,
			timeoutMs: BALANCE_WORKER_STEP_DOWN_S3_TIMEOUT_MS,
		},
	});
	const permits = createStepDownPermits({
		ctx: { objects },
		config: {
			deployment: config.deployment,
			holder: `${config.endpoint}#${process.pid}`,
			slots: BALANCE_WORKER_STEP_DOWN_PERMITS,
			ttlMs: BALANCE_WORKER_STEP_DOWN_PERMIT_TTL_MS,
		},
	});
	const readPeers = readPeersOf({ objects, fleetId });
	return createStepDownController({
		ctx: {
			monitor: ownNetwork,
			readPeers,
			permits,
			partitions: ctx.partitions,
			logger: ctx.logger,
		},
		config: {
			selfEndpoint: config.endpoint,
			peerWaitMs: BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
			peerPollMs: BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
			peerLiveMs: BALANCE_WORKER_STEP_DOWN_PEER_LIVE_MS,
			minPeers: BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
		},
	});
}
