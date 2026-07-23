import { ADMIN_ASYNC_TRACK_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type AsyncTrackConfig,
	AsyncTrackConfigSchema,
} from "./asyncTrackSchemas.js";

const store = createEdgeConfigStore<AsyncTrackConfig>({
	s3Key: ADMIN_ASYNC_TRACK_CONFIG_KEY,
	schema: AsyncTrackConfigSchema,
	defaultValue: () => AsyncTrackConfigSchema.parse({}),
	pollIntervalMs: 30_000,
});

registerEdgeConfig({ store });

export const isAsyncTrackEnabled = ({
	orgId,
	orgSlug,
}: {
	orgId: string;
	orgSlug?: string;
}): boolean => {
	const enabled = store.get().enabledOrgIds;
	return enabled.includes(orgId) || (!!orgSlug && enabled.includes(orgSlug));
};

export const getRuntimeAsyncTrackStatus = () => store.getStatus();

export const getAsyncTrackConfigFromSource = async () => store.readFromSource();

export const updateFullAsyncTrackConfig = async ({
	config,
}: {
	config: AsyncTrackConfig;
}) => {
	await store.writeToSource({ config });
};

export const _setAsyncTrackConfigForTesting = ({
	config,
}: {
	config: AsyncTrackConfig;
}) => {
	store._setRuntimeConfigForTesting(config);
};
