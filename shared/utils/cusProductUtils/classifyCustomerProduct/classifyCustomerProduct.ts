import { CusProductStatus } from "@models/cusProductModels/cusProductEnums.js";
import type { FullCusProduct } from "@models/cusProductModels/cusProductModels.js";
import {
	isFreeProduct,
	isOneOffProduct,
} from "../../productUtils/classifyProduct/classifyProductUtils";
import { notNullish, nullish } from "../../utils";
import { ACTIVE_STATUSES, RELEVANT_STATUSES } from "..";
import { cusProductToPrices } from "../convertCusProduct";

// ============================================================================
// PRODUCT TYPE CHECKS
// ============================================================================

export const isCustomerProductMain = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	return !customerProduct.product.is_add_on;
};

export const isCustomerProductAddOn = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	return customerProduct.product.is_add_on;
};

export const isCustomerProductOneOff = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return isOneOffProduct({ prices });
};

/** Returns true if the product is recurring (not a one-off). Includes free products. */
export const isCustomerProductRecurring = (
	customerProduct?: FullCusProduct,
) => {
	if (!customerProduct) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return !isOneOffProduct({ prices });
};

export const isCustomerProductFree = (cusProduct?: FullCusProduct) => {
	if (!cusProduct) return false;
	const prices = cusProductToPrices({ cusProduct });

	return isFreeProduct({ prices });
};

/** Customer product has at least one price that's not free */
export const isCustomerProductPaid = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return !isFreeProduct({ prices });
};

/** Customer product is both paid AND recurring (not free, not one-off) */
export const isCustomerProductPaidRecurring = (
	customerProduct?: FullCusProduct,
) => {
	if (!customerProduct) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return !isFreeProduct({ prices }) && !isOneOffProduct({ prices });
};

// ============================================================================
// STATUS CHECKS
// ============================================================================

export const isCustomerProductScheduled = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return cp.status === CusProductStatus.Scheduled;
};

export const isCustomerProductCanceling = (cp?: FullCusProduct) => {
	if (!cp) return false;

	return notNullish(cp.canceled_at);
};

export const isCustomerProductExpired = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return cp.status === CusProductStatus.Expired;
};

export const hasCustomerProductEnded = (
	cp: FullCusProduct,
	params?: { nowMs?: number },
) => {
	const nowMs = params?.nowMs ?? Date.now();

	const hasEnded =
		isCustomerProductCanceling(cp) &&
		notNullish(cp.ended_at) &&
		nowMs >= cp.ended_at;
	return hasEnded;
};

export const isCustomerProductTrialing = (
	customerProduct?: FullCusProduct,
	params?: { nowMs?: number },
) => {
	if (!customerProduct) return false;

	const nowMs = params?.nowMs ?? Date.now();
	return customerProduct.trial_ends_at && customerProduct.trial_ends_at > nowMs;
};

export const customerProductHasRelevantStatus = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return RELEVANT_STATUSES.includes(cp.status);
};

export const customerProductHasActiveStatus = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return ACTIVE_STATUSES.includes(cp.status);
};

// ============================================================================
// ENTITY CHECKS
// ============================================================================

/**
 * Returns true if the customer product is assigned to the given entity,
 * or if no entity is specified, true if the product is not assigned to any entity.
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

// ============================================================================
// STRIPE SUBSCRIPTION CHECKS
// ============================================================================

export const isCustomerProductOnStripeSubscription = ({
	customerProduct,
	stripeSubscriptionId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId: string;
}) => {
	return customerProduct.subscription_ids?.includes(stripeSubscriptionId);
};

export const isCustomerProductOnStripeSubscriptionSchedule = ({
	customerProduct,
	stripeSubscriptionScheduleId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionScheduleId: string;
}) => {
	return customerProduct.scheduled_ids?.includes(stripeSubscriptionScheduleId);
};

/** Note: this does not CONFIRM that the subscription is active (might be canceled in Stripe...) */
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

export const customerProductHasSubscriptionSchedule = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	const prices = cusProductToPrices({ cusProduct });

	if (isFreeProduct({ prices }) || isOneOffProduct({ prices })) return false;

	const subId = cusProduct.scheduled_ids?.[0];

	return notNullish(subId);
};
