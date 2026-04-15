import type { ProductV2 } from "@autumn/shared";
import type { SchedulePlan } from "./createScheduleFormSchema";

/** Returns the group key for a product — its group, or its ID if ungrouped. */
export function getProductGroupKey({
	productId,
	products,
}: {
	productId: string;
	products: ProductV2[];
}): string {
	const product = products.find((p) => p.id === productId);
	return product?.group ?? productId;
}

/** Returns the set of group keys already used by plans in a phase, optionally excluding one plan index. */
export function getUsedGroupKeys({
	plans,
	products,
	excludePlanIndex,
}: {
	plans: SchedulePlan[];
	products: ProductV2[];
	excludePlanIndex?: number;
}): Set<string> {
	return new Set(
		plans
			.filter((_, i) => i !== excludePlanIndex)
			.flatMap((p) =>
				p.productId
					? [getProductGroupKey({ productId: p.productId, products })]
					: [],
			),
	);
}
