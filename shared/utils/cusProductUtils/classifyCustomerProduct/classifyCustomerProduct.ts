import { CusProductStatus } from "@models/cusProductModels/cusProductEnums.js";
import type {
	CusProduct,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels.js";
import type { Product } from "@models/productModels/productModels";
import {
	isOneOffPrice,
	isPrepaidPrice,
	orgDefaultAppliesToEntities,
} from "../../..";
import type { SharedContext } from "../../../types/sharedContext";
import { ms } from "../../common";
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

export const isCustomerProductMain = (
	customerProduct?: CusProduct & { product: Product },
) => {
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

	const freeProduct = isFreeProduct({ prices });
	const oneOffProduct = isOneOffProduct({ prices });

	return !freeProduct && !oneOffProduct;
};

// ============================================================================
// STATUS CHECKS
// ============================================================================

export const isCustomerProductScheduled = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return cp.status === CusProductStatus.Scheduled;
};

/**
 * Checks if a scheduled customer product should be activated based on its starts_at time.
 * Uses an optional tolerance to handle timing differences between Stripe and webhook arrival.
 *
 * @param toleranceMs - Tolerance in milliseconds (default: 10 minutes)
 */
export const hasCustomerProductStarted = (
	cp: FullCusProduct,
	params: { nowMs: number; toleranceMs?: number },
) => {
	if (cp.status !== CusProductStatus.Scheduled) return false;
	const toleranceMs = params.toleranceMs ?? 10 * 60 * 1000; // 10 minutes default
	return cp.starts_at <= params.nowMs + toleranceMs;
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
	params?: { nowMs?: number; toleranceMs?: number },
) => {
	const nowMs = params?.nowMs ?? Date.now();
	const toleranceMs = params?.toleranceMs ?? ms.seconds(1);

	const hasEnded =
		// isCustomerProductCanceling(cp) &&
		notNullish(cp.ended_at) && nowMs + toleranceMs >= cp.ended_at;
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

/** A pool owner: customer-level, not itself an assignment, in a live status
 * (PastDue included — dunning must not revoke pools). */
export const isCustomerProductLicenseParent = (
	customerProduct?: Pick<
		FullCusProduct,
		"internal_entity_id" | "license_parent_customer_product_id" | "status"
	>,
) => {
	if (!customerProduct) return false;
	return (
		nullish(customerProduct.internal_entity_id) &&
		nullish(customerProduct.license_parent_customer_product_id) &&
		ACTIVE_STATUSES.includes(customerProduct.status as CusProductStatus)
	);
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
	stripeSubscriptionScheduleId?: string;
}) => {
	if (!stripeSubscriptionScheduleId) return false;
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

export const customerProductHasSubscription = (cusProduct?: FullCusProduct) => {
	if (!cusProduct) return false;
	const prices = cusProductToPrices({ cusProduct });
	if (isFreeProduct({ prices }) || isOneOffProduct({ prices })) return false;

	const subId = cusProduct.subscription_ids?.[0];

	return notNullish(subId);
};

/** Returns true if multiple customer products share the given product ID. */
export const customerProductsHaveDuplicateProductId = ({
	customerProducts,
	productId,
}: {
	customerProducts: FullCusProduct[];
	productId: string;
}): boolean => {
	return (
		customerProducts.filter((cp) => cp.product.id === productId).length > 1
	);
};

export const isCustomerProductEntityScoped = (customerProduct?: CusProduct) => {
	if (!customerProduct) return false;
	return notNullish(customerProduct.internal_entity_id);
};

export const isCustomerProductCustomerScoped = (
	customerProduct?: CusProduct,
) => {
	if (!customerProduct) return false;
	return nullish(customerProduct.internal_entity_id);
};

export const customerProductEligibleForDefaultProduct = ({
	ctx,
	customerProduct,
}: {
	ctx: SharedContext;
	customerProduct: FullCusProduct;
}) => {
	const orgDefaultScopeMatches = orgDefaultAppliesToEntities({ ctx })
		? isCustomerProductEntityScoped(customerProduct)
		: isCustomerProductCustomerScoped(customerProduct);

	if (!orgDefaultScopeMatches) return false;
	if (!isCustomerProductMain(customerProduct)) return false;
	if (!isCustomerProductRecurring(customerProduct)) return false;

	return true;
};

export const customerProductHasPrepaidPrice = (
	customerProduct?: FullCusProduct,
) => {
	if (!customerProduct) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return prices.some((price) => isPrepaidPrice(price));
};

/** A plan may host both a recurring price and a one-off prepaid price for the same
 * feature — this predicate finds the one-off prepaid variant specifically. */
export const customerProductHasOneOffPrepaidForFeature = ({
	customerProduct,
	featureId,
}: {
	customerProduct?: FullCusProduct;
	featureId?: string;
}): boolean => {
	if (!customerProduct || !featureId) return false;
	const prices = cusProductToPrices({ cusProduct: customerProduct });
	return prices.some((price) => {
		if (!isOneOffPrice(price) || !isPrepaidPrice(price)) return false;
		const config = price.config as { feature_id?: string };
		return config.feature_id === featureId;
	});
};

// ============================================================================
// AGGREGATE CHECKS
// ============================================================================

/** Returns true if any customer product is active (or trialing), has a subscription, and is paid recurring. */
export const hasActivePaidSubscription = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): boolean => {
	return customerProducts.some((customerProduct) => {
		const hasActiveOrTrialingStatus =
			ACTIVE_STATUSES.includes(customerProduct.status) ||
			customerProduct.status === CusProductStatus.Trialing;

		if (!hasActiveOrTrialingStatus) return false;
		if (!customerProduct.subscription_ids?.length) return false;

		const prices = cusProductToPrices({ cusProduct: customerProduct });
		return !isOneOffProduct({ prices }) && !isFreeProduct({ prices });
	});
};
