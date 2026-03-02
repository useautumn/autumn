import {
	cusProductToPrices,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	findPriceByFeatureId,
	isCusProductOnEntity,
	isCustomerProductAddOn,
	isCustomerProductMain,
	isCustomerProductOneOff,
	isCustomerProductPaidRecurring,
	isCustomerProductRecurring,
	isPrepaidPrice,
	RELEVANT_STATUSES,
	RecaseError,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";

/**
 * Assigns a numeric priority to a customer product for auto-resolution.
 * Lower = higher priority.
 */
const PRODUCT_PRIORITY = [
	(cp: FullCusProduct) =>
		isCustomerProductMain(cp) && isCustomerProductPaidRecurring(cp),

	(cp: FullCusProduct) =>
		isCustomerProductMain(cp) && isCustomerProductRecurring(cp),

	(cp: FullCusProduct) =>
		isCustomerProductAddOn(cp) && isCustomerProductRecurring(cp),

	(cp: FullCusProduct) => isCustomerProductOneOff(cp),
];

const getProductPriority = (cp: FullCusProduct): number => {
	const index = PRODUCT_PRIORITY.findIndex((matches) => matches(cp));
	return index === -1 ? PRODUCT_PRIORITY.length : index;
};

/** Returns true if the customer product has prepaid options for ALL given feature IDs. */
const cusProductHasAllPrepaidFeatures = ({
	cp,
	featureIds,
}: {
	cp: FullCusProduct;
	featureIds: string[];
}): boolean => {
	const prepaidPrices = cusProductToPrices({ cusProduct: cp }).filter(
		isPrepaidPrice,
	);

	for (const featureId of featureIds) {
		const prepaidPrice = findPriceByFeatureId({
			prices: prepaidPrices,
			featureId,
		});

		if (!prepaidPrice) {
			return false;
		}
	}
	return true;
};

/** Resolves the target without throwing — returns undefined if no match. */
const resolveTargetCustomerProduct = ({
	params,
	candidates,
}: {
	params: UpdateSubscriptionV1Params;
	candidates: FullCusProduct[];
}): FullCusProduct | undefined => {
	// 1. Highest priority: customer_product_id
	if (params.customer_product_id) {
		return candidates.find((cp) => cp.id === params.customer_product_id);
	}

	// 2. subscription_id
	if (params.subscription_id) {
		return candidates.find(
			(cp) =>
				cp.external_id === params.subscription_id ||
				cp.id === params.subscription_id,
		);
	}

	// 3. plan_id
	if (params.plan_id) {
		return candidates.find((cp) => cp.product.id === params.plan_id);
	}

	// 4. Auto-resolve: no explicit filter provided
	const sorted = [...candidates].sort(
		(a, b) =>
			getProductPriority(a) - getProductPriority(b) ||
			b.created_at - a.created_at,
	);

	// If feature_quantities provided, find a product that has ALL features as prepaid
	const featureIds = params.feature_quantities?.map((fq) => fq.feature_id);
	if (featureIds && featureIds.length > 0) {
		return sorted.find((cp) =>
			cusProductHasAllPrepaidFeatures({ cp, featureIds }),
		);
	}

	return sorted[0];
};

/** Builds a descriptive error message based on which filter was used. */
const buildNotFoundMessage = ({
	params,
	customerId,
}: {
	params: UpdateSubscriptionV1Params;
	customerId: string;
}): string => {
	if (params.customer_product_id) {
		return `No active subscription found with customer_product_id '${params.customer_product_id}' for customer '${customerId}'`;
	}
	if (params.subscription_id) {
		return `No active subscription found with subscription_id '${params.subscription_id}' for customer '${customerId}'`;
	}
	if (params.plan_id) {
		return `No active subscription found for plan '${params.plan_id}' on customer '${customerId}'`;
	}
	return `No active subscription found for customer '${customerId}'`;
};

/** Finds the target customer product for an updateSubscription call, or throws. */
export const findTargetCustomerProduct = ({
	params,
	fullCustomer,
}: {
	params: UpdateSubscriptionV1Params;
	fullCustomer: FullCustomer;
}): FullCusProduct => {
	const internalEntityId = fullCustomer.entity?.internal_id;

	const candidates = fullCustomer.customer_products.filter((cp) => {
		if (!RELEVANT_STATUSES.includes(cp.status)) return false;
		return isCusProductOnEntity({ cusProduct: cp, internalEntityId });
	});

	const target = resolveTargetCustomerProduct({ params, candidates });

	if (!target) {
		throw new RecaseError({
			message: buildNotFoundMessage({
				params,
				customerId: fullCustomer.id ?? "",
			}),
			code: ErrCode.CusProductNotFound,
			statusCode: 404,
		});
	}

	return target;
};
