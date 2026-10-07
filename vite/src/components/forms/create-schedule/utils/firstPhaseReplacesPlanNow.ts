import {
	customerProductHasActiveStatus,
	customerProductToReplacementKey,
	type Entity,
	type FullCusProduct,
	isCustomerProductPaidRecurring,
	isCustomerProductTrialing,
	type ProductV2,
} from "@autumn/shared";
import isEqual from "lodash/isEqual";
import { resolveEntityId } from "@/components/forms/customer-state/customerProductsToCustomerState";
import { customerProductToCustomerStatePlan } from "@/components/forms/customer-state/customerProductToCustomerStatePlan";
import type {
	CustomerStatePhase,
	CustomerStatePlan,
} from "@/components/forms/customer-state/customerStateSchema";
import { getProductGroupKey } from "@/components/forms/shared/utils/planGroupUtils";
import { firstPhaseStartsLater } from "./schedulePhaseTiming";

/** Mirrors set_plans' isUnbilledByStripe: a running paid plan no Stripe subscription bills. */
const isUnbilledByStripe = ({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs: number;
}) =>
	isCustomerProductPaidRecurring(customerProduct) &&
	!customerProduct.subscription_ids?.length &&
	!isCustomerProductTrialing(customerProduct, { nowMs });

/** A re-listed plan whose items, version or prepaid quantities differ recreates its row. */
const relistRecreatesRow = ({
	plan,
	customerProduct,
	products,
}: {
	plan: CustomerStatePlan;
	customerProduct: FullCusProduct;
	products: ProductV2[];
}) => {
	const saved = customerProductToCustomerStatePlan({
		cusProduct: customerProduct,
		products,
	});
	const version =
		plan.version ??
		products.find((product) => product.id === plan.productId)?.version;
	return (
		!isEqual(plan.items ?? null, saved.items ?? null) ||
		!isEqual(plan.prepaidOptions, saved.prepaidOptions) ||
		version !== saved.version
	);
};

const replacesCustomerProduct = ({
	plan,
	customerProduct,
	products,
	nowMs,
}: {
	plan: CustomerStatePlan;
	customerProduct: FullCusProduct;
	products: ProductV2[];
	nowMs: number;
}) => {
	if (customerProduct.product.id !== plan.productId) {
		return (
			customerProductToReplacementKey({ customerProduct }) ===
			getProductGroupKey({ productId: plan.productId, products })
		);
	}
	return (
		relistRecreatesRow({ plan, customerProduct, products }) ||
		isUnbilledByStripe({ customerProduct, nowMs })
	);
};

/** Mirrors set_plans' carry-over gate: a first phase starting now replaces a live plan in its scope,
 * by taking its slot, re-listing it changed, or re-listing a plan no Stripe subscription bills. */
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
		(plan) =>
			plan.productId &&
			livePlans.some(
				(customerProduct) =>
					resolveEntityId({
						entityId:
							customerProduct.entity_id ?? customerProduct.internal_entity_id,
						entities,
					}) === resolveEntityId({ entityId: plan.entityId, entities }) &&
					replacesCustomerProduct({ plan, customerProduct, products, nowMs }),
			),
	);
};
