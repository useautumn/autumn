import { ADMIN_METERING_SHADOW_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type MeteringShadowConfig,
	MeteringShadowConfigSchema,
} from "./meteringShadowSchemas.js";

const store = createEdgeConfigStore<MeteringShadowConfig>({
	s3Key: ADMIN_METERING_SHADOW_CONFIG_KEY,
	schema: MeteringShadowConfigSchema,
	defaultValue: () => MeteringShadowConfigSchema.parse({}),
	retainOnError: true,
});

registerEdgeConfig({ store });

/** Synchronous by contract: the shadow tap reads this on every deduction, so it
 *  serves the polled in-memory value and never waits on S3. Before the first
 *  successful load that value is the default, i.e. the mirror stays off. */
export const getMeteringShadowConfig = (): MeteringShadowConfig => store.get();

export const getRuntimeMeteringShadowStatus = () => store.getStatus();

export const getMeteringShadowConfigFromSource = async () =>
	store.readFromSource();

export const updateFullMeteringShadowConfig = async ({
	config,
}: {
	config: MeteringShadowConfig;
}) => {
	await store.writeToSource({ config });
};
