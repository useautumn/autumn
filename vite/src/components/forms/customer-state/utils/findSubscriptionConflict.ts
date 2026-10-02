import {
	customerProductHasRelevantStatus,
	customerProductsToMainPlanName,
	type Entity,
	type FullCusProduct,
	filterCustomerProductsByStripeSubscriptionScope,
	isOneOffProductV2,
	type ProductV2,
	type SetPlansSubscriptionConflict,
} from "@autumn/shared";
import { resolveEntityId } from "../customerProductsToCustomerState";

export type SubscriptionConflict = {
	conflict: SetPlansSubscriptionConflict["conflict"];
	conflictingPlanName: string;
	stripeSubscriptionId: string;
	subscriptionPlanName: string;
};

export type FindSubscriptionConflict = (params: {
	product: ProductV2;
	entityId: string | null;
}) => SubscriptionConflict | null;

const groupOf = (group: string | null | undefined) => group ?? "";

/** Mirrors the server's guards: a recurring plan can't be added under one
 * subscription when it, or the main plan its group would replace, is billed on another. */
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
	if (isOneOffProductV2({ items: product.items })) return null;

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

	const alreadyBilled = onOtherSubscriptions.find(
		(customerProduct) => customerProduct.product.id === product.id,
	);
	const replaced = product.is_add_on
		? undefined
		: onOtherSubscriptions.find(
				(customerProduct) =>
					!customerProduct.product.is_add_on &&
					groupOf(customerProduct.product.group) === groupOf(product.group),
			);
	const conflicting = alreadyBilled ?? replaced;
	if (!conflicting) return null;

	const [otherSubscriptionId] = conflicting.subscription_ids ?? [];
	const conflictingPlanName = conflicting.product.name;
	return {
		conflict: alreadyBilled ? "already_billed" : "replaces",
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
