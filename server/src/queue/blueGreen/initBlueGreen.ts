import {
	hasAwsTaskIdentity,
	resolveAwsTaskIdentity,
} from "@/external/aws/ecs/awsTaskIdentity.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	startBlueGreenHeartbeat,
	stopBlueGreenHeartbeat,
} from "./blueGreenHeartbeat.js";
import {
	startBlueGreenSlotStorePolling,
	stopBlueGreenSlotStorePolling,
} from "./blueGreenSlotStore.js";

/**
 * Wire blue-green into the worker process:
 *   1. Resolve AWS task identity (idempotent — `awsTaskIdentity` also fires
 *      a fire-and-forget at module load, so identity is usually ready by the
 *      time this runs).
 *   2. Start polling the S3 active-slot pointer.
 *   3. Start the per-instance heartbeat writer.
 *
 * Polling is started here (not via the global edge-config registry) because
 * `initBlueGreen` runs after `startAllEdgeConfigPolling` in the worker boot path.
 * No-op when identity can't be resolved (local dev / non-ECS).
 */
export const initBlueGreen = async ({
	db,
	logger,
}: {
	db: DrizzleCli;
	logger?: Logger;
}) => {
	const identity = await resolveAwsTaskIdentity();
	await startBlueGreenSlotStorePolling({ serviceName: "workers", logger });
	startBlueGreenHeartbeat({ db, logger, serviceName: "workers" });

	if (hasAwsTaskIdentity()) {
		logger?.info(
			`[BlueGreen] Worker identity resolved: serviceArn=${identity.serviceArn ?? "unknown"} sha=${identity.imageSha ?? "unknown"}. Slot gate active.`,
		);
	}
};

export const shutdownBlueGreen = () => {
	stopBlueGreenHeartbeat();
	stopBlueGreenSlotStorePolling({ serviceName: "workers" });
};
