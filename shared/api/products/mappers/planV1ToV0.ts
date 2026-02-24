import type { ApiPlanV1 } from "@api/products/apiPlanV1";
import { planItemV1ToV0 } from "@api/products/items/mappers/planItemV1ToV0";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import type { SharedContext } from "../../../types/sharedContext";

/**
 * Transform ApiPlanV1 to ApiPlan (V0)
 *
 * Handles the following conversions:
 * - auto_enable -> default
 * - features: ApiPlanItemV1[] -> ApiPlanItemV0[]
 */
export function planV1ToV0({
	ctx,
	plan,
}: {
	ctx: SharedContext;
	plan: ApiPlanV1;
}): ApiPlan {
	return {
		...plan,
		default: plan.auto_enable,
		features: plan.items.map((item) => planItemV1ToV0({ ctx, item })),
	};
}
