import {
	fullSubjectToCustomerEntitlements,
	RouteGroup,
	Scopes,
	SetUsageParamsSchema,
} from "@autumn/shared";
import { createRoute } from "@/honoMiddlewares/routeHandler.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { updateUsageV2 } from "../updateBalance/v2/updateUsageV2.js";
import {
	validateInvoiceCreditBalanceMutationForFeature,
	validateInvoiceCreditFeatureMutation,
} from "../utils/validateInvoiceCreditBalanceMutation.js";

export const handleSetUsage = createRoute({
	scopes: [Scopes.Balances.Write],
	routeGroup: RouteGroup.Balances,
	body: SetUsageParamsSchema,
	handler: async (c) => {
		const body = c.req.valid("json");
		const ctx = c.get("ctx");

		if (isFullSubjectRolloutEnabled({ ctx })) {
		}

		validateInvoiceCreditFeatureMutation({
			feature: ctx.features.find((feature) => feature.id === body.feature_id),
		});

		const fullSubject = await getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
			},
			source: "handleSetUsage",
		});

		validateInvoiceCreditBalanceMutationForFeature({
			customerEntitlements: fullSubjectToCustomerEntitlements({
				fullSubject,
				featureIds: [body.feature_id],
			}),
			featureId: body.feature_id,
		});

		await updateUsageV2({
			ctx,
			fullSubject,
			params: {
				customer_id: body.customer_id,
				feature_id: body.feature_id,
				usage: body.value,
				entity_id: body.entity_id,
			},
		});

		return c.json({ success: true });
	},
});
