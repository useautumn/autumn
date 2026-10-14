import {
	AffectedResource,
	ApiVersion,
	isCollectionMethodSwitch,
	Scopes,
	UpdateSubscriptionV0ParamsSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions";
import { handleSwitchCollectionMethodErrors } from "@/internal/billing/v2/actions/switchCollectionMethod/errors/handleSwitchCollectionMethodErrors";
import { setupSwitchCollectionMethodContext } from "@/internal/billing/v2/actions/switchCollectionMethod/setup/setupSwitchCollectionMethodContext";
import { previewPendingPlanIfAny } from "@/internal/billing/v2/execute/pendingCustomerProducts/previewPendingPlanIfAny";
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

		const pendingPreview = await previewPendingPlanIfAny({
			ctx,
			params: body,
		});
		if (pendingPreview) return c.json(pendingPreview, 200);

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

		const previewResponse = await billingActions.previewUpdateSubscription({
			ctx,
			params: isSwitch ? unchangedPlanParams : body,
		});

		return c.json(previewResponse, 200);
	},
});
