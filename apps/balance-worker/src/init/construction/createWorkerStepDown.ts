import {
	BALANCE_WORKER_STEP_DOWN_CLOCK_SKEW_MS,
	BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
	BALANCE_WORKER_STEP_DOWN_PEER_MEMBERSHIP_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
	BALANCE_WORKER_STEP_DOWN_PERMIT_RENEW_MS,
	BALANCE_WORKER_STEP_DOWN_PERMIT_TTL_MS,
	BALANCE_WORKER_STEP_DOWN_PERMITS,
} from "@autumn/env/balanceWorkerConstants";
import type { AutumnLogger } from "@autumn/logging";
import type { SlotWorkReading } from "../../blueGreen/types/slotHeartbeat.js";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import { createOwnNetworkMonitor } from "../../health/ownNetwork/createOwnNetworkMonitor.js";
import type { PartitionSendWatches } from "../../health/ownNetwork/types/partitionSendWatches.js";
import { createStepDownController } from "../../health/stepDown/createStepDownController.js";
import { createStepDownPermits } from "../../health/stepDown/createStepDownPermits.js";
import { readFleetHeartbeats } from "../../health/stepDown/readFleetHeartbeats.js";
import type { FleetHeartbeats } from "../../health/stepDown/types/fleetHeartbeats.js";
import type { StepDownController } from "../../health/stepDown/types/stepDownController.js";
import type { Partitions } from "../../partitions/types/partitions.js";

type WorkerStepDownContext = {
	sendWatches: PartitionSendWatches;
	partitions: Pick<
		Partitions,
		"stepDown" | "isSteppedDown" | "hasAssignment" | "isAdmitted"
	>;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	objects?: AdminBucketObjects;
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
		ctx: { sends: ctx.sendWatches, isServing: ctx.partitions.isAdmitted },
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
}): () => Promise<FleetHeartbeats> {
	function readPeers(): Promise<FleetHeartbeats> {
		return readFleetHeartbeats({
			ctx: { objects },
			fleetId,
			modifiedAfter: Date.now() - BALANCE_WORKER_STEP_DOWN_PEER_MEMBERSHIP_MS,
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
	const { objects } = ctx;
	const { fleetId } = config;
	if (!objects || !fleetId) return undefined;
	const permits = createStepDownPermits({
		ctx: { objects },
		config: {
			deployment: config.deployment,
			holder: `${config.endpoint}#${process.pid}`,
			slots: BALANCE_WORKER_STEP_DOWN_PERMITS,
			ttlMs: BALANCE_WORKER_STEP_DOWN_PERMIT_TTL_MS,
		},
	});
	return createStepDownController({
		ctx: {
			monitor: ownNetwork,
			readPeers: readPeersOf({ objects, fleetId }),
			permits,
			partitions: ctx.partitions,
			logger: ctx.logger,
		},
		config: {
			selfEndpoint: config.endpoint,
			peerWaitMs: BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
			peerPollMs: BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
			membershipMs: BALANCE_WORKER_STEP_DOWN_PEER_MEMBERSHIP_MS,
			skewMs: BALANCE_WORKER_STEP_DOWN_CLOCK_SKEW_MS,
			minPeers: BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
			permitRenewMs: BALANCE_WORKER_STEP_DOWN_PERMIT_RENEW_MS,
		},
	});
}
