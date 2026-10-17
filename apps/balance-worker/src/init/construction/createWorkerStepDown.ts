import {
	BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
	BALANCE_WORKER_STEP_DOWN_PEER_ACK_AGE_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
	BALANCE_WORKER_STEP_DOWN_PERMITS,
} from "@autumn/env/balanceWorkerConstants";
import type { AutumnLogger } from "@autumn/logging";
import type { SlotWork } from "../../blueGreen/types/slotHeartbeat.js";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import { createOwnNetworkMonitor } from "../../health/ownNetwork/createOwnNetworkMonitor.js";
import type { PartitionSendWatches } from "../../health/ownNetwork/types/partitionSendWatches.js";
import { createStepDownController } from "../../health/stepDown/createStepDownController.js";
import { createStepDownPermits } from "../../health/stepDown/createStepDownPermits.js";
import { readFleetHeartbeats } from "../../health/stepDown/readFleetHeartbeats.js";
import type {
	FleetListing,
	FleetRead,
} from "../../health/stepDown/types/fleetHeartbeats.js";
import type { StepDownController } from "../../health/stepDown/types/stepDownController.js";
import type { Partitions } from "../../partitions/types/partitions.js";

type WorkerStepDownContext = {
	sendWatches: PartitionSendWatches;
	partitions: Pick<
		Partitions,
		"stepDown" | "isSteppedDown" | "hasAssignment" | "isHeld"
	>;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	objects?: AdminBucketObjects;
};

type WorkerStepDownConfig = {
	deployment: string;
	endpoint: string;
	fleetId: string | null;
	imageSha: string | null;
	partitionCount: number;
};

export function stepDownPermitScopeOf({
	deployment,
	fleetId,
	imageSha,
}: {
	deployment: string;
	fleetId: string;
	imageSha: string | null;
}): string {
	return `${deployment}/${fleetId}/${imageSha ?? "unversioned"}`;
}

export function createWorkerStepDown({
	ctx,
	config,
}: {
	ctx: WorkerStepDownContext;
	config: WorkerStepDownConfig;
}): { readWork(): SlotWork; start(): void; stop(): Promise<void> } {
	const ownNetwork = createOwnNetworkMonitor({
		ctx: { sends: ctx.sendWatches, isHeld: ctx.partitions.isHeld },
	});
	const controller = createController({ ctx, config, ownNetwork });

	function readWork(): SlotWork {
		return {
			lastSendAckAgeMs: ctx.sendWatches.readLastAckAgeMs(),
			ownNetwork: ownNetwork.verdict().state,
			steppedDown: ctx.partitions.isSteppedDown(),
		};
	}

	function start(): void {
		ownNetwork.start();
		controller?.start();
	}

	async function stop(): Promise<void> {
		const stopped = controller?.stop();
		ownNetwork.stop();
		await stopped;
	}

	return { readWork, start, stop };
}

function readPeersOf({
	objects,
	fleetId,
}: {
	objects: AdminBucketObjects;
	fleetId: string;
}): (params: { since: FleetListing | null }) => Promise<FleetRead> {
	function readPeers({
		since,
	}: {
		since: FleetListing | null;
	}): Promise<FleetRead> {
		return readFleetHeartbeats({ ctx: { objects }, fleetId, since });
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
			scope: stepDownPermitScopeOf({
				deployment: config.deployment,
				fleetId,
				imageSha: config.imageSha,
			}),
			holder: `${config.endpoint}#${process.pid}`,
			slots: BALANCE_WORKER_STEP_DOWN_PERMITS,
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
			partitionCount: config.partitionCount,
			ackAgeLimitMs: BALANCE_WORKER_STEP_DOWN_PEER_ACK_AGE_MS,
			minPeers: BALANCE_WORKER_STEP_DOWN_MIN_PEERS,
		},
	});
}
