import {
	AffectedResource,
	ApiVersion,
	InternalError,
	isCollectionMethodSwitch,
	Scopes,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingContextToUpdateAction } from "@/internal/approvals/facts/billing/billingContextToUpdateAction";
import { billingPreviewPermissionFields } from "@/internal/approvals/preview/billingPreviewPermissionFields";
import { billingActions } from "@/internal/billing/v2/actions";
import { handleSwitchCollectionMethodErrors } from "@/internal/billing/v2/actions/switchCollectionMethod/errors/handleSwitchCollectionMethodErrors";
import { setupSwitchCollectionMethodContext } from "@/internal/billing/v2/actions/switchCollectionMethod/setup/setupSwitchCollectionMethodContext";
import { pendingReplacementToLiveUpdate } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingReplacementToLiveUpdate";
import { previewPendingPlanIfAny } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingPlanIfAny";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
import { billingPlanToUpdateSubscriptionPreviewIntent } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreviewIntent";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";

export const handlePreviewUpdateSubscription = createRoute({
	scopes: [Scopes.Billing.Read],
	versionedBody: {
		latest: UpdateSubscriptionV1ParamsSchema,
		[ApiVersion.V1_Beta]: UpdateSubscriptionV0ParamsSchema,
	},
	resource: AffectedResource.ApiSubscriptionUpdate,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");
		const liveUpdate = await pendingReplacementToLiveUpdate({
			ctx,
			params: body,
		});

		// A switch bills nothing now: validate it like billing.update does, then preview the unchanged plan.
		const isSwitch = !liveUpdate && isCollectionMethodSwitch(body);
		if (isSwitch) {
			const switchContext = await setupSwitchCollectionMethodContext({
				ctx,
				params: body,
			});
			handleSwitchCollectionMethodErrors({ ctx, switchContext });
		}
		const {
			invoice_mode: _invoiceMode,
			redirect_mode: _redirectMode,
			...unchangedPlanParams
		} = body;

		if (!isSwitch && !liveUpdate) {
			const pending = await previewPendingPlanIfAny({ ctx, params: body });
			// The edit re-attaches the pending plan, but it's still the member's update.
			if (pending) {
				const permissionFields = await billingPreviewPermissionFields({
					ctx,
					...pending,
					action: "billing.update_subscription",
				});
				return c.json({ ...pending.preview, ...permissionFields }, 200);
			}
		}

		const { billingContext, billingPlan } =
			await billingActions.updateSubscription({
				ctx,
				params: liveUpdate?.params ?? (isSwitch ? unchangedPlanParams : body),
				contextOverride: liveUpdate?.contextOverride,
				preview: true,
			});

		if (!billingPlan) {
			throw new InternalError({
				message: "billingPlan not returned from updateSubscription preview",
			});
		}

		// 7. Format response
		const previewResponse = await billingPlanToUpdateSubscriptionPreview({
			ctx,
			billingContext,
			billingPlan,
			intent: billingPlanToUpdateSubscriptionPreviewIntent({ billingContext }),
		});
		const permissionFields = await billingPreviewPermissionFields({
			ctx,
			billingContext,
			billingPlan,
			preview: previewResponse,
			action: billingContextToUpdateAction({ billingContext }),
		});

		return c.json({ ...previewResponse, ...permissionFields }, 200);
	},
});
