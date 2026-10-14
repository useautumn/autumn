import {
	ByocCacheNetworkSchema,
	ResizeByocCacheParamsSchema,
	Scopes,
} from "@autumn/shared";
import { z } from "zod/v4";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { resourcesToMachine } from "@/internal/byoc/utils/byocCacheUtils.js";
import { startShadowAtom } from "../actions/startShadowAtom.js";

const CreateShadowAtomParamsSchema = ResizeByocCacheParamsSchema.and(
	z.object({ network: ByocCacheNetworkSchema.optional() }),
);

export const handleCreateShadowAtom = createRoute({
	scopes: [Scopes.Superuser],
	body: CreateShadowAtomParamsSchema,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const { cpu, memory, network } = c.req.valid("json");
		return c.json(
			await startShadowAtom({
				ctx,
				machine: resourcesToMachine({ cpu, memory }),
				network: network ?? null,
			}),
		);
	},
});
