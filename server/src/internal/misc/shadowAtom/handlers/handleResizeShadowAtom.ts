import { ResizeByocCacheParamsSchema, Scopes } from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resourcesToMachine } from "@/internal/byoc/utils/byocCacheUtils.js";
import { resizeShadowAtom } from "../actions/resizeShadowAtom.js";

export const handleResizeShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: ResizeByocCacheParamsSchema,
	handler: async (c) => {
		const machine = resourcesToMachine(c.req.valid("json"));
		return c.json(await resizeShadowAtom({ machine }));
	},
});
