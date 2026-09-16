import type {
	FullCusProduct,
	UpdateSubscriptionBillingContext,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { PreparedUpdatePlanArtifactIds } from "../applyPrepareResults/index.js";

export interface UpdatePlanProductContext {
	customerProduct: FullCusProduct;
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
	preparedIds: PreparedUpdatePlanArtifactIds;
}
