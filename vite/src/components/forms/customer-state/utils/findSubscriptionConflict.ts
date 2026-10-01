import {
	customerProductHasRelevantStatus,
	customerProductsToMainPlanName,
	type Entity,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
	type ProductV2,
} from "@autumn/shared";
import { resolveEntityId } from "../customerProductsToCustomerState";

export type SubscriptionConflict = {
	conflictingPlanName: string;
	stripeSubscriptionId: string;
	subscriptionPlanName: string;
};

export type FindSubscriptionConflict = (params: {
	product: ProductV2;
	entityId: string | null;
}) => SubscriptionConflict | null;

const groupOf = (group: string | null | undefined) => group ?? "";

/** Mirrors the server's guards: a plan can't be added under one subscription when
 * it, or the main plan its group would replace, is billed on another. */
export const findSubscriptionConflict = ({
	customerProducts,
	entities,
	stripeSubscriptionId,
	stripeScheduleId,
	product,
	entityId,
}: {
	customerProducts: FullCusProduct[];
	entities: Entity[];
	stripeSubscriptionId: string | null;
	stripeScheduleId: string | null;
	product: ProductV2;
	entityId: string | null;
}): SubscriptionConflict | null => {
	if (!stripeSubscriptionId && !stripeScheduleId) return null;

	const inScopeIds = new Set(
		filterCustomerProductsByStripeSubscriptionScope({
			customerProducts,
			stripeSubscriptionId,
			stripeScheduleId,
		}).map(({ id }) => id),
	);
	const onOtherSubscriptions = customerProducts.filter(
		(customerProduct) =>
			customerProductHasRelevantStatus(customerProduct) &&
			!inScopeIds.has(customerProduct.id) &&
			Boolean(customerProduct.subscription_ids?.length) &&
			resolveEntityId({
				entityId:
					customerProduct.entity_id ?? customerProduct.internal_entity_id,
				entities,
			}) === entityId,
	);

	const conflicting =
		onOtherSubscriptions.find(
			(customerProduct) => customerProduct.product.id === product.id,
		) ??
		(product.is_add_on
			? undefined
			: onOtherSubscriptions.find(
					(customerProduct) =>
						!customerProduct.product.is_add_on &&
						groupOf(customerProduct.product.group) === groupOf(product.group),
				));
	if (!conflicting) return null;

	const [otherSubscriptionId] = conflicting.subscription_ids ?? [];
	const conflictingPlanName = conflicting.product.name;
	return {
		conflictingPlanName,
		stripeSubscriptionId: otherSubscriptionId,
		subscriptionPlanName:
			customerProductsToMainPlanName({
				customerProducts: customerProducts.filter(
					(customerProduct) =>
						customerProductHasRelevantStatus(customerProduct) &&
						customerProduct.subscription_ids?.includes(otherSubscriptionId),
				),
			}) ?? conflictingPlanName,
	};
};
