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

/** Pure in-memory lookup -- zero I/O, sync. */
export const isStripeSyncEnabled = ({ orgId }: { orgId: string }): boolean => {
	return store.get().enabledOrgIds.includes(orgId);
};
