import {
	AffectedResource,
	ApiVersion,
	FinalizeLockParamsV0Schema,
	FinalizeLockParamsV1Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { runFinalizeLock } from "../finalizeLock/runFinalizeLock.js";

export const handleFinalizeLock = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	versionedBody: {
		latest: FinalizeLockParamsV1Schema,
		[ApiVersion.V2_5]: FinalizeLockParamsV0Schema,
	},
	resource: AffectedResource.FinalizeLock,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const params = c.req.valid("json");

		const response = await runFinalizeLock({ ctx, params });
		const status = ctx.extraLogs.finalizeLockQueuedForReplay ? 202 : 200;

		return c.json(response, status);
	},
});
