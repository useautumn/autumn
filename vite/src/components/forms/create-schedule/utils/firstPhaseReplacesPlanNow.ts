import {
	customerProductHasActiveStatus,
	customerProductToReplacementKey,
	type Entity,
	type FullCusProduct,
	type ProductV2,
} from "@autumn/shared";
import { resolveEntityId } from "@/components/forms/customer-state/customerProductsToCustomerState";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/** Mirrors set_plans' carry-over gate: a first phase starting now puts another
 * plan in a live plan's slot and scope. A re-customized same plan is left out. */
export const firstPhaseReplacesPlanNow = ({
	phases,
	customerProducts,
	entities,
	products,
	nowMs,
}: {
	phases: CustomerStatePhase[];
	customerProducts: FullCusProduct[];
	entities: Entity[];
	products: ProductV2[];
	nowMs: number;
}): boolean => {
	if (firstPhaseStartsLater({ phases, nowMs })) return false;

	const livePlans = customerProducts.filter(customerProductHasActiveStatus);
	return (phases[0]?.plans ?? []).some(
		({ productId, entityId }) =>
			productId &&
			livePlans.some(
				(customerProduct) =>
					customerProduct.product.id !== productId &&
					customerProductToReplacementKey({ customerProduct }) ===
						getProductGroupKey({ productId, products }) &&
					resolveEntityId({
						entityId:
							customerProduct.entity_id ?? customerProduct.internal_entity_id,
						entities,
					}) === resolveEntityId({ entityId, entities }),
			),
	);
};
