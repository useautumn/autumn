import { ResizeByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resourcesToMachine } from "@/internal/byoc/utils/byocCacheUtils.js";
import { startShadowAtom } from "../actions/startShadowAtom.js";

export const handleCreateShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: ResizeByocCacheParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const machine = resourcesToMachine(c.req.valid("json"));
		return c.json(await startShadowAtom({ ctx, machine }));
	},
});
