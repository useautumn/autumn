import { ADMIN_BALANCE_SHADOW_CONFIG_KEY } from "@/external/aws/s3/adminS3Config.js";
import { createEdgeConfigStore } from "@/internal/misc/edgeConfig/edgeConfigStore.js";
import { BalanceShadowEdgeConfigSchema } from "./balanceShadowEdgeConfig.js";

export const balanceShadowStore = createEdgeConfigStore({
	s3Key: ADMIN_BALANCE_SHADOW_CONFIG_KEY,
	schema: BalanceShadowEdgeConfigSchema,
	defaultValue: () => ({ enabled: false as const }),
});
