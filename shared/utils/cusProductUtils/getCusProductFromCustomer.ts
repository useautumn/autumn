import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { FullCustomer } from "../../models/cusModels/fullCusModel";
import {
	customerProductHasSubscriptionSchedule,
	isCusProductOnEntity,
} from "./classifyCustomerProduct/classifyCustomerProduct";
import { cp } from "./classifyCustomerProduct/cpBuilder";

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

	const activeCusProduct = cusProducts.find((customerProduct) => {
		// 1. Product matches
		const productMatches = customerProduct.product.id === productId;

		// 2. Entity matches
		const entityMatches = isCusProductOnEntity({
			cusProduct: customerProduct,
			internalEntityId,
		});

		// 3. Status is active and recurring
		const { valid } = cp(customerProduct)
			.recurring()
			.hasActiveStatus()
			.onEntity({ internalEntityId });

		return productMatches && entityMatches && valid;
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

	const cusProducts = fullCus.customer_products.filter((customerProduct) => {
		const { valid } = cp(customerProduct)
			.paidRecurring()
			.hasActiveStatus()
			.hasSubscription();

		return valid;
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
