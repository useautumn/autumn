import { BLUE_GREEN_ACTIVE_SLOT_KEY } from "@/external/aws/s3/adminS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type ActiveSlotConfig,
	ActiveSlotConfigSchema,
} from "./blueGreenSchemas.js";

/**
 * S3-backed pointer for the currently-active worker task set.
 * Both fields null = blue-green not yet configured (gate falls back to allow).
 *
 * Note: not registered with the global edge-config registry — `initBlueGreen`
 * starts polling explicitly because it runs after `startAllEdgeConfigPolling`.
 */
const store = createEdgeConfigStore<ActiveSlotConfig>({
	s3Key: BLUE_GREEN_ACTIVE_SLOT_KEY,
	schema: ActiveSlotConfigSchema,
	defaultValue: () => ({
		activeTaskDefinitionArn: null,
		activeImageSha: null,
		updatedAt: new Date(0).toISOString(),
	}),
});

export const startBlueGreenSlotStorePolling = ({
	logger,
}: {
	logger?: Logger;
} = {}) => store.startPolling({ logger });

export const stopBlueGreenSlotStorePolling = () => store.stopPolling();

export const getActiveSlotConfig = () => store.get();
export const getActiveSlotStoreStatus = () => store.getStatus();
export const readActiveSlotFromS3 = () => store.readFromSource();
export const writeActiveSlotToS3 = ({ config }: { config: ActiveSlotConfig }) =>
	store.writeToSource({ config });

/** Test-only escape hatch matching the edge config store interface. */
export const _setActiveSlotForTesting = (config: ActiveSlotConfig) =>
	store._setRuntimeConfigForTesting(config);
