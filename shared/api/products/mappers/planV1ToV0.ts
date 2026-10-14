import type { ApiPlanV1 } from "@api/products/apiPlanV1";
import { planItemV1ToV0 } from "@api/products/items/mappers/planItemV1ToV0";
import type { ApiPlan } from "@api/products/previousVersions/apiPlanV0";
import type { SharedContext } from "../../../types/sharedContext";

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
