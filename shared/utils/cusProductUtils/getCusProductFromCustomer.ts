import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { FullCustomer } from "../../models/cusModels/fullCusModel";
import {
	cusProductHasSubscription,
	customerProductHasSubscriptionSchedule,
	isCusProductOnEntity,
	isCusProductOngoing,
} from "./classifyCusProduct";

/**
 * Finds the active main (not add-on, not one-off) customer product in a given group for a customer.
 * Filters by product group, entity, active status, non-add-on, and non-one-off products.
 */
export const getOngoingMainCusProductByGroup = ({
	fullCus,
	productGroup,
}: {
	fullCus: FullCustomer;
	productGroup: string;
}) => {
	const internalEntityId = fullCus.entity?.internal_id;
	const cusProducts = fullCus.customer_products;

	const activeMainCusProduct = cusProducts.find((cp) => {
		// 1. Product group matches
		const productGroupMatches = cp.product.group === productGroup;

		// 2. Entity matches
		const entityMatches = isCusProductOnEntity({
			cusProduct: cp,
			internalEntityId,
		});

		// 3. Status is active
		const isOngoing = isCusProductOngoing({ cusProduct: cp });

		// 4. Is main product
		const isMainProduct = !cp.product.is_add_on;

		return productGroupMatches && entityMatches && isOngoing && isMainProduct;
	});

	return activeMainCusProduct;
};

/**
 * Finds the active customer product by id for a customer.
 * Filters by product id, entity, active status.
 */
export const getOngoingCusProductById = ({
	fullCus,
	productId,
}: {
	fullCus: FullCustomer;
	productId: string;
}) => {
	const internalEntityId = fullCus.entity?.internal_id;
	const cusProducts = fullCus.customer_products;

	const activeCusProduct = cusProducts.find((cp) => {
		// 1. Product matches
		const productMatches = cp.product.id === productId;

		// 2. Entity matches
		const entityMatches = isCusProductOnEntity({
			cusProduct: cp,
			internalEntityId,
		});

		// 3. Status is active
		const isOngoing = isCusProductOngoing({ cusProduct: cp });

		return productMatches && entityMatches && isOngoing;
	});

	return activeCusProduct;
};

const sortCustomerProductsForBilling = ({
	customerProducts,
	productId,
	productGroup,
	cusProductId,
	internalEntityId,
}: {
	customerProducts: FullCusProduct[];
	productId: string;
	productGroup: string;
	cusProductId?: string;
	internalEntityId?: string;
}) => {
	return customerProducts.sort((a, b) => {
		// 0. Cus product ID match
		const aCusProductIdMatch = a.id === cusProductId;
		const bCusProductIdMatch = b.id === cusProductId;

		if (aCusProductIdMatch && !bCusProductIdMatch) return -1;
		if (!aCusProductIdMatch && bCusProductIdMatch) return 1;

		// 1. Entity match (highest priority)
		const aEntityMatch = isCusProductOnEntity({
			cusProduct: a,
			internalEntityId,
		});
		const bEntityMatch = isCusProductOnEntity({
			cusProduct: b,
			internalEntityId,
		});

		if (aEntityMatch && !bEntityMatch) return -1;
		if (!aEntityMatch && bEntityMatch) return 1;

		// 2. Main product (add-ons lowest priority)
		const aIsMain = !a.product.is_add_on;
		const bIsMain = !b.product.is_add_on;

		if (aIsMain && !bIsMain) return -1;
		if (!aIsMain && bIsMain) return 1;

		// 3. Product ID match
		const aProductIdMatch = a.product.id === productId;
		const bProductIdMatch = b.product.id === productId;

		if (aProductIdMatch && !bProductIdMatch) return -1;
		if (!aProductIdMatch && bProductIdMatch) return 1;

		// 4. Product group match
		const aGroupMatch = a.product.group === productGroup;
		const bGroupMatch = b.product.group === productGroup;

		if (aGroupMatch && !bGroupMatch) return -1;
		if (!aGroupMatch && bGroupMatch) return 1;

		return 0;
	});
};

/**
 * Finds the best cus product to merge subscriptions with for an incoming product.
 * Priority: 1. Entity match, 2. Product ID match, 3. Product group match
 */
export const getTargetSubscriptionCusProduct = ({
	fullCus,
	productId,
	productGroup,
	cusProductId,
}: {
	fullCus: FullCustomer;
	productId: string;
	productGroup: string;
	cusProductId?: string;
}) => {
	const internalEntityId = fullCus.entity?.internal_id;

	const cusProducts = fullCus.customer_products.filter((cp) => {
		const isOngoing = isCusProductOngoing({ cusProduct: cp });
		const hasSub = cusProductHasSubscription({ cusProduct: cp });
		return isOngoing && hasSub;
	});

	// Sort by merge order:
	// 1. Entity match (highest priority)
	// 2. Main product (add-ons lowest priority)
	// 3. Product ID match
	// 4. Product group match
	sortCustomerProductsForBilling({
		customerProducts: cusProducts,
		productId,
		productGroup,
		cusProductId,
		internalEntityId,
	});

	return cusProducts[0];
};

/**
 * Finds the best cus product to merge subscriptions with for an incoming product.
 * Priority: 1. Entity match, 2. Product ID match, 3. Product group match
 */
export const getTargetSubscriptionScheduleCusProduct = ({
	fullCus,
	productId,
	productGroup,
	cusProductId,
}: {
	fullCus: FullCustomer;
	productId: string;
	productGroup: string;
	cusProductId?: string;
}) => {
	const internalEntityId = fullCus.entity?.internal_id;

	const cusProducts = fullCus.customer_products.filter((cp) => {
		const hasSubscriptionSchedule = customerProductHasSubscriptionSchedule({
			cusProduct: cp,
		});
		return hasSubscriptionSchedule;
	});

	// Sort by merge order:
	// 1. Entity match (highest priority)
	// 2. Main product (add-ons lowest priority)
	// 3. Product ID match
	// 4. Product group match
	sortCustomerProductsForBilling({
		customerProducts: cusProducts,
		productId,
		productGroup,
		cusProductId,
		internalEntityId,
	});

	return cusProducts[0];
};
