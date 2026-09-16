import { ErrCode, RecaseError, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import {
	BalanceShadowEdgeConfigSchema,
	parseBalanceShadowEdgeConfig,
} from "@/internal/balances/shadow/balanceShadowEdgeConfig.js";
import { balanceShadowStore } from "@/internal/balances/shadow/balanceShadowStore.js";

export const handleUpsertAdminBalanceShadowConfig = createRoute({
	scopes: [Scopes.Superuser],
	body: BalanceShadowEdgeConfigSchema,
	handler: async (c) => {
		const config = c.req.valid("json");
		try {
			parseBalanceShadowEdgeConfig({ input: config, runtimeEnv: process.env });
		} catch (error) {
			throw new RecaseError({
				message:
					error instanceof Error
						? error.message
						: "Invalid Balance Shadow config",
				code: ErrCode.InvalidInputs,
				statusCode: 400,
			});
		}
		await balanceShadowStore.writeToSource({ config });
		return c.json({ success: true });
	},
});
