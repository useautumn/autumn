import {
	AffectedResource,
	type CreateScheduleParamsV0,
	CreateScheduleParamsV0Schema,
	type CreateScheduleResponse,
	Scopes,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

type CreateScheduleActionParams = {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
};

const BILLING_LOCK_TTL_MS = 120000;

export const createScheduleRoute = ({
	action,
	lockMessage,
}: {
	action: (
		actionParams: CreateScheduleActionParams,
	) => Promise<CreateScheduleResponse>;
	lockMessage: string;
}) =>
	createRoute({
		scopes: [Scopes.Billing.Write],
		body: CreateScheduleParamsV0Schema,

		lock:
			process.env.NODE_ENV !== "development"
				? {
						ttlMs: BILLING_LOCK_TTL_MS,
						errorMessage: lockMessage,
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
			const response = await action({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			});

			return c.json(response, 200);
		},
	});

export const createSchedulePreviewRoute = <PreviewResponse extends object>({
	action,
}: {
	action: (
		actionParams: CreateScheduleActionParams,
	) => Promise<PreviewResponse>;
}) =>
	createRoute({
		scopes: [Scopes.Billing.Read],
		body: CreateScheduleParamsV0Schema,
		resource: AffectedResource.MultiAttach,
		handler: async (c) => {
			const preview = await action({
				ctx: c.get("ctx"),
				params: c.req.valid("json"),
			});

			return c.json(preview, 200);
		},
	});
