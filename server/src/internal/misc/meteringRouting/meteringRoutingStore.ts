import { ADMIN_METERING_ROUTING_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type MeteringRoutingConfig,
	MeteringRoutingConfigSchema,
} from "./meteringRoutingSchemas.js";

const store = createEdgeConfigStore<MeteringRoutingConfig>({
	s3Key: ADMIN_METERING_ROUTING_CONFIG_KEY,
	schema: MeteringRoutingConfigSchema,
	defaultValue: () => MeteringRoutingConfigSchema.parse({}),
	retainOnError: true,
});

registerEdgeConfig({ store });

/** Synchronous by contract: check and track read this per request, so it serves
 *  the polled in-memory value and never waits on S3. Before the first
 *  successful load that value is the default, i.e. every org routes nowhere. */
export const getMeteringRoutingConfig = (): MeteringRoutingConfig =>
	store.get();

export const getRuntimeMeteringRoutingStatus = () => store.getStatus();

export const getMeteringRoutingConfigFromSource = async () =>
	store.readFromSource();

export const updateFullMeteringRoutingConfig = async ({
	config,
}: {
	config: MeteringRoutingConfig;
}) => {
	await store.writeToSource({ config });
};
