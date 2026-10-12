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
import { handleSwitchCollectionMethodErrors } from "@/internal/billing/v2/actions/switchCollectionMethod/errors/handleSwitchCollectionMethodErrors";
import { setupSwitchCollectionMethodContext } from "@/internal/billing/v2/actions/switchCollectionMethod/setup/setupSwitchCollectionMethodContext";
import { billingPlanToUpdateSubscriptionPreview } from "@/internal/billing/v2/utils/billingPlan/toUpdateSubscriptionPreview/billingPlanToUpdateSubscriptionPreview";
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

		// A switch bills nothing now: validate it like billing.update does, then preview the unchanged plan.
		const isSwitch = isCollectionMethodSwitch(body);
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

		const { billingContext, billingPlan } =
			await billingActions.updateSubscription({
				ctx,
				params: isSwitch ? unchangedPlanParams : body,
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
		});

		return c.json(previewResponse, 200);
	},
});
