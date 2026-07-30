import type { ProductV2 } from "@autumn/shared";
import { getUsedProductGroupKeys } from "@/components/forms/shared/utils/planGroupUtils";
import type { SchedulePlan } from "./createScheduleFormSchema";

export function getUsedGroupKeys({
	plans,
	products,
	excludePlanIndex,
}: {
	plans: SchedulePlan[];
	products: ProductV2[];
	excludePlanIndex?: number;
}): Set<string> {
	return getUsedProductGroupKeys({
		productIds: plans
			.filter((_, index) => index !== excludePlanIndex)
			.map(({ productId }) => productId),
		products,
	});
}
