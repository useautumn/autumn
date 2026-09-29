import { createEdgeConfigRegistry as createRegistry } from "@autumn/edge-config";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";

/** The server's registry over its admin bucket; tests build their own with fake timestamps. */
export const createEdgeConfigRegistry = (
	options: Omit<Parameters<typeof createRegistry>[0], "ctx"> = {},
) => createRegistry({ ctx: { location: getAdminS3Config }, ...options });

const registry = createEdgeConfigRegistry();
export const registerEdgeConfig = registry.register;
export const refreshAllEdgeConfigs = registry.refreshAll;
export const startAllEdgeConfigPolling = registry.start;
export const stopAllEdgeConfigPolling = registry.stop;
