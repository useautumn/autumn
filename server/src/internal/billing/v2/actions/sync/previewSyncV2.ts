import type { PreviewSyncV2Response, SyncParamsV1 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { computeSyncPlan } from "./compute/computeSyncPlan";
import { setupSyncContext } from "./setup/setupSyncContext";

export const previewSyncV2 = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SyncParamsV1;
}): Promise<PreviewSyncV2Response> => {
	const subscriptionId = params.stripe_subscription_id;
	if (!subscriptionId) return { mismatches: [] };

	const syncContext = await setupSyncContext({ ctx, params });
	const { autumnBillingPlan } = computeSyncPlan({ ctx, syncContext });
	const projectedCustomer = applyAutumnBillingPlanToFullCustomer({
		fullCustomer: syncContext.fullCustomer,
		autumnBillingPlan,
	});

	const verification = await verify({
		ctx,
		params: {
			customer_id: params.customer_id,
			subscription_ids: [subscriptionId],
		},
		prefetched: { fullCustomer: projectedCustomer },
	});

	return {
		mismatches:
			verification.subscriptions.find(
				(subscription) =>
					subscription.stripe_subscription_id === subscriptionId,
			)?.mismatches ?? [],
	};
};
