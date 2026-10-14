import type { CustomerProductWithPricesView } from "@models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { CusProductStatus } from "@models/cusProductModels/cusProductEnums.js";
import type {
	CusProduct,
	FullCusProduct,
} from "@models/cusProductModels/cusProductModels.js";
import type { Product } from "@models/productModels/productModels";
import { isPrepaidPrice, orgDefaultAppliesToEntities } from "../../..";
import type { SharedContext } from "../../../types/sharedContext";
import { ms } from "../../common";
import {
	isFreeProduct,
	isOneOffProduct,
} from "../../productUtils/classifyProduct/classifyProductUtils";
import { notNullish, nullish } from "../../utils";
import { ACTIVE_STATUSES, RELEVANT_STATUSES } from "..";
import { cusProductToPrices } from "../convertCusProduct";
import { customerProductToEffectivePrices } from "../convertCusProduct/customerProductToEffectivePrices";

export const isCustomerProductMain = (customerProduct?: {
	product: Pick<Product, "is_add_on">;
}) => {
	if (!customerProduct) return false;
	return !customerProduct.product.is_add_on;
};

export const isCustomerProductAddOn = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	return customerProduct.product.is_add_on;
};

export const isCustomerProductOneOff = (
	customerProduct?: CustomerProductWithPricesView,
) => {
	if (!customerProduct) return false;
	const prices = customerProductToEffectivePrices({ customerProduct });
	return isOneOffProduct({ prices });
};

export const isCustomerProductRecurring = (
	customerProduct?: CustomerProductWithPricesView,
) => {
	if (!customerProduct) return false;
	const prices = customerProductToEffectivePrices({ customerProduct });
	return !isOneOffProduct({ prices });
};

export const isCustomerProductFree = (cusProduct?: FullCusProduct) => {
	if (!cusProduct) return false;
	const prices = customerProductToEffectivePrices({
		customerProduct: cusProduct,
	});

	return isFreeProduct({ prices });
};

export const isCustomerProductPaid = (customerProduct?: FullCusProduct) => {
	if (!customerProduct) return false;
	const prices = customerProductToEffectivePrices({ customerProduct });
	return !isFreeProduct({ prices });
};

export const isCustomerProductPaidRecurring = (
	customerProduct?: FullCusProduct,
) => {
	if (!customerProduct) return false;
	const prices = customerProductToEffectivePrices({ customerProduct });

	const freeProduct = isFreeProduct({ prices });
	const oneOffProduct = isOneOffProduct({ prices });

	return !freeProduct && !oneOffProduct;
};

export const isCustomerProductScheduled = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return cp.status === CusProductStatus.Scheduled;
};

export const hasCustomerProductStarted = (
	cp: FullCusProduct,
	params: { nowMs: number; toleranceMs?: number },
) => {
	if (cp.status !== CusProductStatus.Scheduled) return false;
	const toleranceMs = params.toleranceMs ?? 10 * 60 * 1000;
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

export const isCustomerProductRevertingTrial = (customerProduct?: {
	on_trial_end?: string | null;
}) => customerProduct?.on_trial_end === "revert";

export const customerProductHasRelevantStatus = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return RELEVANT_STATUSES.includes(cp.status);
};

export const customerProductHasActiveStatus = (cp?: FullCusProduct) => {
	if (!cp) return false;
	return ACTIVE_STATUSES.includes(cp.status);
};

export const isCustomerProductLicenseParent = (
	customerProduct?: Pick<
		FullCusProduct,
		"internal_entity_id" | "customer_license_link_id" | "status"
	>,
) => {
	if (!customerProduct) return false;
	return (
		nullish(customerProduct.internal_entity_id) &&
		nullish(customerProduct.customer_license_link_id) &&
		ACTIVE_STATUSES.includes(customerProduct.status as CusProductStatus)
	);
};

type LicenseParentCandidate = Pick<
	FullCusProduct,
	"internal_entity_id" | "customer_license_link_id" | "status"
>;

export const isLicenseAssignableParentCustomerProduct = ({
	customerProduct,
}: {
	customerProduct: LicenseParentCandidate;
}) =>
	nullish(customerProduct.internal_entity_id) &&
	nullish(customerProduct.customer_license_link_id) &&
	ACTIVE_STATUSES.includes(customerProduct.status as CusProductStatus);

export const isCustomerProductLicenseAssignment = (
	customerProduct?: LicenseParentCandidate,
) => {
	if (!customerProduct) return false;
	return (
		notNullish(customerProduct.internal_entity_id) &&
		notNullish(customerProduct.customer_license_link_id) &&
		ACTIVE_STATUSES.includes(customerProduct.status as CusProductStatus)
	);
};

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

export const isCustomerProductInStripeSubscriptionScope = ({
	customerProduct,
	stripeSubscriptionId,
	stripeSubscriptionScheduleId,
}: {
	customerProduct: FullCusProduct;
	stripeSubscriptionId?: string | null;
	stripeSubscriptionScheduleId?: string | null;
}): boolean =>
	Boolean(
		(stripeSubscriptionId &&
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId,
			})) ||
			isCustomerProductOnStripeSubscriptionSchedule({
				customerProduct,
				stripeSubscriptionScheduleId: stripeSubscriptionScheduleId ?? undefined,
			}),
	);

export const isCustomerProductUnlinkedFree = (
	customerProduct: FullCusProduct,
) =>
	isCustomerProductFree(customerProduct) &&
	!customerProduct.subscription_ids?.length &&
	!customerProduct.scheduled_ids?.length;

export const cusProductHasSubscription = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	if (!isCustomerProductPaidRecurring(cusProduct)) return false;

	const subId = cusProduct.subscription_ids?.[0];

	return notNullish(subId);
};

export const customerProductHasSubscriptionSchedule = ({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) => {
	if (!isCustomerProductPaidRecurring(cusProduct)) return false;

	const subId = cusProduct.scheduled_ids?.[0];

	return notNullish(subId);
};

export const customerProductHasSubscription = (cusProduct?: FullCusProduct) => {
	if (!cusProduct) return false;
	if (!isCustomerProductPaidRecurring(cusProduct)) return false;

	const subId = cusProduct.subscription_ids?.[0];

	return notNullish(subId);
};

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

		return isCustomerProductPaidRecurring(customerProduct);
	});
};
