import {
	AffectedResource,
	ApiVersion,
	FinalizeLockParamsV0Schema,
	FinalizeLockParamsV1Schema,
	RouteGroup,
	Scopes,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import { withAtomShadowDeduction } from "../atomShadowDeduct/withAtomShadowDeduction.js";
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

		const { body, status } = await withAtomShadowDeduction({
			ctx,
			// Before 2.6 a finalize names no customer, so only the API can find its lock.
			call: params.customer_id ? { route: "finalize", params } : null,
			idempotencyKey: undefined,
			runOnApi: async () => ({
				body: await runFinalizeLock({ ctx, params }),
				status: ctx.extraLogs.finalizeLockQueuedForReplay ? 202 : 200,
			}),
		});

		return c.json(body, status);
	},
});
