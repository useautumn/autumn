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
