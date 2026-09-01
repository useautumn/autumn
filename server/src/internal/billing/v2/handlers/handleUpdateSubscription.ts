import {
	AffectedResource,
	ApiVersion,
	InternalError,
	Scopes,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/discardPendingCustomerProduct";
import { findPendingCustomerProduct } from "@/internal/billing/v2/execute/findPendingCustomerProduct";
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

		// A plan awaiting payment has no subscription to update against, so a
		// cancel discards it rather than pricing a change against one.
		if (body.cancel_action) {
			const pendingCustomerProduct = await findPendingCustomerProduct({
				ctx,
				customerId: body.customer_id,
				productId: body.plan_id,
				entityId: body.entity_id,
			});

			if (pendingCustomerProduct) {
				await discardPendingCustomerProduct({
					ctx,
					customerProduct: pendingCustomerProduct,
				});

				return c.json({ success: true }, 200);
			}
		}

		const { billingContext, billingResult } =
			await billingActions.updateSubscription({
				ctx,
				params: body,
				preview: false,
			});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from updateSubscription action",
			});
		}

		// 7. Format response
		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
