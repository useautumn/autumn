import {
	AffectedResource,
	ApiVersion,
	InternalError,
	isCollectionMethodSwitch,
	Scopes,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { enablesPendingPlan } from "@/internal/billing/v2/execute/pendingCustomerProducts/enablesPendingPlan";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/findPendingCustomerProduct";
import { pendingReplacementToLiveUpdate } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingReplacementToLiveUpdate";
import { updatePendingPlanIfAny } from "@/internal/billing/v2/execute/pendingCustomerProducts/updatePendingPlanIfAny";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";

export const handleUpdateSubscription = createRoute({
	scopes: [Scopes.Billing.Write],
	versionedBody: {
		latest: UpdateSubscriptionV1ParamsSchema,
		[ApiVersion.V1_Beta]: UpdateSubscriptionV0ParamsSchema,
	},
	resource: AffectedResource.ApiSubscriptionUpdate,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Update subscription already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const attachBody = c.req.valid("json");
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: attachBody.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const shouldEnablePendingPlan =
			enablesPendingPlan({ params: body }) &&
			Boolean(
				await findPendingCustomerProduct({
					ctx,
					customerId: body.customer_id,
					productId: body.plan_id,
					entityId: body.entity_id,
					customerProductId: body.customer_product_id,
					subscriptionId: body.subscription_id,
				}),
			);
		const liveUpdate = await pendingReplacementToLiveUpdate({
			ctx,
			params: body,
		});

		if (
			!liveUpdate &&
			!shouldEnablePendingPlan &&
			isCollectionMethodSwitch(body)
		) {
			return c.json(
				await billingActions.switchCollectionMethod({ ctx, params: body }),
				200,
			);
		}

		const pendingUpdate =
			!liveUpdate && (await updatePendingPlanIfAny({ ctx, params: body }));

		if (pendingUpdate) {
			const { billingContext, billingResult } = pendingUpdate;
			if (!billingContext || !billingResult) {
				return c.json({ success: true }, 200);
			}

			return c.json(
				billingResultToResponse({ billingContext, billingResult }),
				200,
			);
		}

		const { billingContext, billingResult } =
			await billingActions.updateSubscription({
				ctx,
				params: liveUpdate?.params ?? body,
				contextOverride: liveUpdate?.contextOverride,
				preview: false,
			});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from updateSubscription action",
			});
		}

		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
