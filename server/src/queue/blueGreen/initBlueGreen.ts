import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	startBlueGreenHeartbeat,
	stopBlueGreenHeartbeat,
} from "./blueGreenHeartbeat.js";
import {
	hasWorkerIdentity,
	resolveWorkerIdentity,
} from "./blueGreenSlotEnv.js";
import {
	startBlueGreenSlotStorePolling,
	stopBlueGreenSlotStorePolling,
} from "./blueGreenSlotStore.js";

/**
 * Wire blue-green into the worker process:
 *   1. Resolve task identity from ECS metadata (cached for process lifetime).
 *   2. Start polling the S3 active-slot pointer.
 *   3. Start the per-instance heartbeat writer.
 *
 * Polling is started here (not via the global edge-config registry) because
 * `initBlueGreen` runs after `startAllEdgeConfigPolling` in the worker boot path.
 * No-op when identity can't be resolved (local dev outside ECS).
 */
export const initBlueGreen = async ({ logger }: { logger?: Logger } = {}) => {
	const identity = await resolveWorkerIdentity();
	await startBlueGreenSlotStorePolling({ logger });
	startBlueGreenHeartbeat({ logger });

	if (hasWorkerIdentity()) {
		logger?.info(
			`[BlueGreen] Worker identity resolved: taskDef=${identity.taskDefinitionArn ?? "unknown"} sha=${identity.imageSha ?? "unknown"}. Slot gate active.`,
		);
		console.log(
			`[BlueGreen] Worker identity resolved: taskDef=${identity.taskDefinitionArn ?? "unknown"} sha=${identity.imageSha ?? "unknown"}. Slot gate active.`,
		);
	}
};

export const shutdownBlueGreen = () => {
	stopBlueGreenHeartbeat();
	stopBlueGreenSlotStorePolling();
};
