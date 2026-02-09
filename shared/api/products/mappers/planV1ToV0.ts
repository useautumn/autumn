import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import { planItemV1ToV0 } from "@api/products/items/mappers/planItemV1ToV0.js";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0.js";

/**
 * Transform ApiPlanV1 to ApiPlan (V0)
 *
 * Handles the following conversions:
 * - auto_enable -> default
 * - features: ApiPlanItemV1[] -> ApiPlanItemV0[]
 */
export function planV1ToV0(plan: ApiPlanV1): ApiPlan {
	return {
		...plan,
		default: plan.auto_enable,
		features: plan.items.map(planItemV1ToV0),
	};
}
