import {
	BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
	BALANCE_WORKER_OWN_NETWORK_SAMPLE_MS,
	BALANCE_WORKER_STEP_DOWN_MAX_OWNER_LAG_MS,
	BALANCE_WORKER_STEP_DOWN_MIN_KEPT_UP_SHARE,
	BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
	BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
	BALANCE_WORKER_STEP_DOWN_PERMITS,
	BALANCE_WORKER_STEP_DOWN_PROGRESS_TIMEOUT_MS,
	BALANCE_WORKER_STEP_DOWN_RECHECK_ATTEMPTS,
} from "@autumn/env/balanceWorkerConstants";
import type { AutumnLogger } from "@autumn/logging";
import type { AdminBucketObjects } from "../../external/s3/types/adminBucketObjects.js";
import { createOwnNetworkMonitor } from "../../health/ownNetwork/createOwnNetworkMonitor.js";
import type { PartitionSendWatches } from "../../health/ownNetwork/types/partitionSendWatches.js";
import { createStepDownController } from "../../health/stepDown/createStepDownController.js";
import { createStepDownPermits } from "../../health/stepDown/createStepDownPermits.js";
import type { FleetProgress } from "../../health/stepDown/types/fleetProgress.js";
import type { StepDownController } from "../../health/stepDown/types/stepDownController.js";
import type { Partitions } from "../../partitions/types/partitions.js";

type WorkerStepDownContext = {
	sendWatches: PartitionSendWatches;
	partitions: Pick<
		Partitions,
		| "stepDown"
		| "isSteppedDown"
		| "hasAssignment"
		| "holdingOf"
		| "heldPartitions"
	>;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	objects?: AdminBucketObjects;
	readFleetProgress?: () => Promise<FleetProgress>;
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
}): { start(): void; stop(): Promise<void> } {
	function heldCount(): number {
		return ctx.partitions.heldPartitions().length;
	}
	const ownNetwork = createOwnNetworkMonitor({
		ctx: {
			sends: ctx.sendWatches,
			holdingOf: ctx.partitions.holdingOf,
			heldCount,
		},
	});
	const controller = createController({ ctx, config, ownNetwork });

	function start(): void {
		ownNetwork.start();
		controller?.start();
	}

	async function stop(): Promise<void> {
		const stopped = controller?.stop();
		ownNetwork.stop();
		await stopped;
	}

	return { start, stop };
}

export function readFleetProgressWithin({
	read,
	timeoutMs,
}: {
	read: () => Promise<FleetProgress>;
	timeoutMs: number;
}): () => Promise<FleetProgress> {
	const state: { inFlight: Promise<FleetProgress> | null } = { inFlight: null };
	async function readThenSettle(): Promise<FleetProgress> {
		try {
			return await read();
		} finally {
			state.inFlight = null;
		}
	}
	function startOrJoin(): Promise<FleetProgress> {
		state.inFlight ??= readThenSettle();
		return state.inFlight;
	}
	async function readWithin(): Promise<FleetProgress> {
		const late = Promise.withResolvers<never>();
		function expire(): void {
			late.reject(new Error(`Fleet progress took longer than ${timeoutMs} ms`));
		}
		const timer = setTimeout(expire, timeoutMs);
		try {
			return await Promise.race([startOrJoin(), late.promise]);
		} finally {
			clearTimeout(timer);
		}
	}
	return readWithin;
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
	const { objects, readFleetProgress } = ctx;
	const { fleetId } = config;
	if (!objects || !fleetId || !readFleetProgress) return undefined;
	function ownPartitions(): ReadonlySet<number> {
		return new Set(ctx.partitions.heldPartitions());
	}
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
			readFleetProgress: readFleetProgressWithin({
				read: readFleetProgress,
				timeoutMs: BALANCE_WORKER_STEP_DOWN_PROGRESS_TIMEOUT_MS,
			}),
			ownPartitions,
			permits,
			partitions: ctx.partitions,
			logger: ctx.logger,
		},
		config: {
			peerWaitMs: BALANCE_WORKER_STEP_DOWN_PEER_WAIT_MS,
			peerPollMs: BALANCE_WORKER_STEP_DOWN_PEER_POLL_MS,
			minKeptUp: Math.ceil(
				config.partitionCount * BALANCE_WORKER_STEP_DOWN_MIN_KEPT_UP_SHARE,
			),
			maxOwnerLagMs: BALANCE_WORKER_STEP_DOWN_MAX_OWNER_LAG_MS,
			recheckAttempts: BALANCE_WORKER_STEP_DOWN_RECHECK_ATTEMPTS,
			recheckIntervalMs: BALANCE_WORKER_OWN_NETWORK_SAMPLE_MS,
			minStalledPartitions: BALANCE_WORKER_OWN_NETWORK_MIN_STALLED_PARTITIONS,
		},
	});
}
