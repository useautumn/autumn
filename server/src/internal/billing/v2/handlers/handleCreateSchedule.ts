import {
	CreateScheduleParamsV0Schema,
	type CreateScheduleResponse,
	Scopes,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

/** Handle the internal create-schedule RPC route. */
export const handleCreateSchedule = createRoute({
	scopes: [Scopes.Billing.Write],
	body: CreateScheduleParamsV0Schema,
	withTx: true,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Create schedule already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const body = c.req.valid("json");
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: body.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const response = (await billingActions.createSchedule({
			ctx: c.get("ctx"),
			params: c.req.valid("json"),
		})) satisfies CreateScheduleResponse;

		return c.json(response, 200);
	},
});
