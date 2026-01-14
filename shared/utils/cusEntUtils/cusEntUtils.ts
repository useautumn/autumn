import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Feature } from "@models/featureModels/featureModels.js";
import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCusProduct } from "../../models/cusProductModels/cusProductModels.js";
import { isPrepaidPrice } from "../productUtils/priceUtils/classifyPriceUtils.js";
import { cusEntToCusPrice } from "./convertCusEntUtils/cusEntToCusPrice.js";

export const formatCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return `${cusEnt.entitlement.feature_id} (${cusEnt.entitlement.interval}) (${cusEnt.balance})`;
};

export const isEntityCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}): boolean => {
	return !!(
		cusEnt.entitlement.entity_feature_id ||
		cusEnt.customer_product?.internal_entity_id
	);
};

// export const cusEntMatchesEntity = ({
// 	cusEnt,
// 	entity,
// }: {
// 	cusEnt: FullCusEntWithFullCusProduct;
// 	entity?: Entity;
// }) => {
// 	if (!entity) return true;

// 	let cusProductMatch = true;

// 	if (notNullish(cusEnt.customer_product?.internal_entity_id)) {
// 		cusProductMatch =
// 			cusEnt.customer_product.internal_entity_id === entity.internal_id;
// 	}

// 	let entityFeatureIdMatch = true;
// 	// let feature = features?.find(
// 	//   (f) => f.id == cusEnt.entitlement.entity_feature_id,
// 	// );

// 	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
// 		entityFeatureIdMatch =
// 			cusEnt.entitlement.entity_feature_id === entity.feature_id;
// 	}

// 	return cusProductMatch && entityFeatureIdMatch;
// };

export const isPrepaidCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice || !isPrepaidPrice(cusPrice.price)) return false;

	if (!cusEnt.customer_product) return false;

	// 3. Get quantity
	const options = cusEnt.customer_product?.options?.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return false;

	return true;
};

export const addCusProductToCusEnt = ({
	cusEnt,
	cusProduct,
}: {
	cusEnt: FullCustomerEntitlement;
	cusProduct: FullCusProduct;
}): FullCusEntWithFullCusProduct => {
	return {
		...cusEnt,
		customer_product: cusProduct,
	};
};

/**
 * Clones a customer entitlement and updates the quantity in its options.
 * Needed because usagePriceToLineItem reads quantity from customer_product.options.
 */
export const cloneEntitlementWithUpdatedQuantity = ({
	customerEntitlement,
	feature,
	quantityDifference,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	feature: Feature;
	quantityDifference: number;
}): FullCusEntWithFullCusProduct => {
	const cloned = structuredClone(customerEntitlement);
	const optionIndex = cloned.customer_product.options.findIndex(
		(opt) => opt.internal_feature_id === feature.internal_id,
	);

	if (optionIndex !== -1) {
		cloned.customer_product.options[optionIndex].quantity = new Decimal(
			cloned.customer_product.options[optionIndex].quantity,
		)
			.add(quantityDifference)
			.toNumber();
	}

	return cloned;
};
