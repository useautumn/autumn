import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { cusEntToCusPrice } from "../productUtils/convertUtils.js";
import { isPrepaidPrice } from "../productUtils/priceUtils.js";

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
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice || !isPrepaidPrice({ price: cusPrice.price })) return false;

	// 3. Get quantity
	const options = cusEnt.customer_product.options.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return false;

	return true;
};
