import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import type { FullCustomer } from "../../models/cusModels/fullCusModel";
import {
	customerProductHasSubscriptionSchedule,
	isCusProductOnEntity,
} from "./classifyCustomerProduct/classifyCustomerProduct";
import { cp } from "./classifyCustomerProduct/cpBuilder";

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
		const productMatches = customerProduct.product.id === productId;

		const entityMatches = isCusProductOnEntity({
			cusProduct: customerProduct,
			internalEntityId,
		});

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
		const aCusProductIdMatch = a.id === cusProductId;
		const bCusProductIdMatch = b.id === cusProductId;

		if (aCusProductIdMatch && !bCusProductIdMatch) return -1;
		if (!aCusProductIdMatch && bCusProductIdMatch) return 1;

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

		const aIsMain = !a.product.is_add_on;
		const bIsMain = !b.product.is_add_on;

		if (aIsMain && !bIsMain) return -1;
		if (!aIsMain && bIsMain) return 1;

		const aProductIdMatch = a.product.id === productId;
		const bProductIdMatch = b.product.id === productId;

		if (aProductIdMatch && !bProductIdMatch) return -1;
		if (!aProductIdMatch && bProductIdMatch) return 1;

		const aGroupMatch = a.product.group === productGroup;
		const bGroupMatch = b.product.group === productGroup;

		if (aGroupMatch && !bGroupMatch) return -1;
		if (!aGroupMatch && bGroupMatch) return 1;

		return 0;
	});
};

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

	sortCustomerProductsForBilling({
		customerProducts: cusProducts,
		productId,
		productGroup,
		cusProductId,
		internalEntityId,
	});

	return cusProducts[0];
};

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

	if (cusProductId) {
		const targetCusProduct = cusProducts.find((cp) => cp.id === cusProductId);
		const targetExists = fullCus.customer_products.some(
			(cp) => cp.id === cusProductId,
		);
		if (targetExists && !targetCusProduct) return undefined;
	}

	sortCustomerProductsForBilling({
		customerProducts: cusProducts,
		productId,
		productGroup,
		cusProductId,
		internalEntityId,
	});

	return cusProducts[0];
};
