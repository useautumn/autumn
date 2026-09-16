import type {
	FullCusProduct,
	MigrationItemRunSkipReason,
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

/** A matched customer product either gets a billing context or is skipped
 * with the reason the item run will carry. */
export type UpdatePlanProductSetup =
	| { outcome: "ready"; context: UpdatePlanProductContext }
	| { outcome: "skipped"; skipReason: MigrationItemRunSkipReason };
