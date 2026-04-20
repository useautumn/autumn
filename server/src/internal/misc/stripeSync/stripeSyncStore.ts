import { registerEdgeConfig } from "@/internal/misc/edgeConfig/edgeConfigRegistry.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import {
	type StripeSyncConfig,
	StripeSyncConfigSchema,
} from "./stripeSyncSchemas.js";

const store = createEdgeConfigStore<StripeSyncConfig>({
	s3Key: "admin/stripe-sync-config.json",
	schema: StripeSyncConfigSchema,
	defaultValue: () => ({ enabledOrgIds: [] }),
	pollIntervalMs: 60_000,
});

registerEdgeConfig({ store });

/** Pure in-memory lookup -- zero I/O, sync. Matches on org ID or slug. */
export const isStripeSyncEnabled = ({
	orgId,
	orgSlug,
}: {
	orgId: string;
	orgSlug?: string;
}): boolean => {
	const enabled = store.get().enabledOrgIds;
	return enabled.includes(orgId) || (!!orgSlug && enabled.includes(orgSlug));
};

export const getRuntimeStripeSyncStatus = () => store.getStatus();

export const getStripeSyncConfigFromSource = async () => store.readFromSource();

export const updateFullStripeSyncConfig = async ({
	config,
}: {
	config: StripeSyncConfig;
}) => {
	await store.writeToSource({ config });
};
