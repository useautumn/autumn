import { ms } from "@autumn/shared";
import {
	BLUE_GREEN_ACTIVE_SLOT_KEY,
	BLUE_GREEN_CRON_ACTIVE_SLOT_KEY,
} from "@/external/aws/s3/adminS3Config.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type ActiveSlotConfig,
	ActiveSlotConfigSchema,
} from "./blueGreenSchemas.js";

export type BlueGreenServiceName = "workers" | "cron";

/**
 * Each blue-green service (workers, cron) has its own S3 active-slot record
 * so they can be swapped independently. Both stores poll every 2s — cheap
 * S3 GETs, sub-2s swap latency.
 */
const createSlotStore = ({ s3Key }: { s3Key: string }) =>
	createEdgeConfigStore<ActiveSlotConfig>({
		s3Key,
		schema: ActiveSlotConfigSchema,
		pollIntervalMs: ms.seconds(2),
		defaultValue: () => ({
			activeTaskDefinitionArn: null,
			activeImageSha: null,
			updatedAt: new Date(0).toISOString(),
		}),
	});

const stores = {
	workers: createSlotStore({ s3Key: BLUE_GREEN_ACTIVE_SLOT_KEY }),
	cron: createSlotStore({ s3Key: BLUE_GREEN_CRON_ACTIVE_SLOT_KEY }),
} as const;

const getStore = (serviceName: BlueGreenServiceName) => stores[serviceName];

export const startBlueGreenSlotStorePolling = ({
	serviceName,
	logger,
}: {
	serviceName: BlueGreenServiceName;
	logger?: Logger;
}) => getStore(serviceName).startPolling({ logger });

export const stopBlueGreenSlotStorePolling = ({
	serviceName,
}: {
	serviceName: BlueGreenServiceName;
}) => getStore(serviceName).stopPolling();

export const getActiveSlotConfig = ({
	serviceName,
}: {
	serviceName: BlueGreenServiceName;
}) => getStore(serviceName).get();

export const getActiveSlotStoreStatus = ({
	serviceName,
}: {
	serviceName: BlueGreenServiceName;
}) => getStore(serviceName).getStatus();

export const readActiveSlotFromS3 = ({
	serviceName,
}: {
	serviceName: BlueGreenServiceName;
}) => getStore(serviceName).readFromSource();

export const writeActiveSlotToS3 = ({
	serviceName,
	config,
}: {
	serviceName: BlueGreenServiceName;
	config: ActiveSlotConfig;
}) => getStore(serviceName).writeToSource({ config });

/** Test-only escape hatch matching the edge config store interface. */
export const _setActiveSlotForTesting = ({
	serviceName,
	config,
}: {
	serviceName: BlueGreenServiceName;
	config: ActiveSlotConfig;
}) => getStore(serviceName)._setRuntimeConfigForTesting(config);
