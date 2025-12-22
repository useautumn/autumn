import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import {
	isFreeProduct,
	isOneOffProduct,
} from "../productUtils/classifyProduct/classifyProductUtils";
import { notNullish, nullish } from "../utils";
import { cusProductToPrices } from "./convertCusProduct";
import { ACTIVE_STATUSES } from "./cusProductConstants";

export const isCusProductOneOff = ({
	cusProduct,
}: {
	cusProduct?: FullCusProduct;
}) => {
	if (!cusProduct) return false;

	const prices = cusProductToPrices({ cusProduct });

	return isOneOffProduct({ prices });
};

export const isCusProductCanceled = ({
	cusProduct,
}: {
	cusProduct?: FullCusProduct;
}) => {
	if (!cusProduct) return false;

	return cusProduct.canceled;
};

export const isCusProductTrialing = ({
	cusProduct,
	now,
}: {
	cusProduct?: FullCusProduct;
	now?: number;
}) => {
	if (!cusProduct) return false;

	return (
		cusProduct.trial_ends_at && cusProduct.trial_ends_at > (now || Date.now())
	);
};

/**
 * Returns true if the customer product is assigned to the given entity,
 * or if no entity is specified, true if the product is not assigned to any entity.
 * @param cusProduct - The customer product object
 * @param internalEntityId - The internal entity ID to check, or undefined to check for unassigned
 */
export const isCusProductOnEntity = ({
	cusProduct,
	internalEntityId,
}: {
	cusProduct: FullCusProduct;
	internalEntityId?: string;
}) => {
	return internalEntityId
		? cusProduct.internal_entity_id === internalEntityId
		: nullish(cusProduct.internal_entity_id);
};

/**
 * An "ongoing" customer product is one that:
 * - Is NOT a "one off" (recurring or repeating, not a purchase-once type)
 * - Has an "active" status (see ACTIVE_STATUSES)
 */
export const isCusProductOngoing = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const isActive = ACTIVE_STATUSES.includes(cusProduct.status);

	const prices = cusProductToPrices({ cusProduct });
	const isNotOneOff = !isOneOffProduct({ prices });

	return isActive && isNotOneOff;
};

export const isCustomerProductOnStripeSubscription = ({
	customerProduct,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
}) => {
	return customerProduct.subscription_ids?.includes(stripeSubscriptionId);
};

// Note, this does not CONFIRM that the subscription is active (might be canceled in Stripe...)
export const cusProductHasSubscription = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const prices = cusProductToPrices({ cusProduct });

	if (isFreeProduct({ prices }) || isOneOffProduct({ prices })) return false;

	const subId = cusProduct.subscription_ids?.[0];

	return notNullish(subId);
};
