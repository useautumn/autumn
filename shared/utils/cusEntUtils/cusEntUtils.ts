import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import type { PgDeductionUpdate } from "../../api/balances/track/trackTypes/pgDeductionUpdate.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullCusEntWithFullCusProduct, FullCusEntWithOptionalProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
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

export const updateCusEntInFullCus = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: PgDeductionUpdate;
}) => {
	for (let i = 0; i < fullCus.customer_products.length; i++) {
		for (
			let j = 0;
			j < fullCus.customer_products[i].customer_entitlements.length;
			j++
		) {
			const ce = fullCus.customer_products[i].customer_entitlements[j];
			if (ce.id === cusEntId) {
				let replaceables = ce.replaceables ?? [];

				if (update.newReplaceables) {
					replaceables = [
						...replaceables,
						...update.newReplaceables.map((r) => ({
							...r,
							delete_next_cycle: r.delete_next_cycle ?? true,
							from_entity_id: r.from_entity_id ?? null,
						})),
					];
				}

				if (update.deletedReplaceables) {
					replaceables = replaceables.filter(
						(r) => !update.deletedReplaceables?.map((r) => r.id).includes(r.id),
					);
				}

				fullCus.customer_products[i].customer_entitlements[j] = {
					...ce,
					balance: update.balance,
					entities: update.entities,
					adjustment: update.adjustment,
					replaceables,
				};
			}
		}
	}
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
	cusEnt: FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct;
}) => {
	// 2. If cus ent is not prepaid, skip
	const cusPrice = cusEntToCusPrice({ cusEnt });
	if (!cusPrice || !isPrepaidPrice({ price: cusPrice.price })) return false;

	// 3. Get quantity
	const options = cusEnt.customer_product?.options?.find(
		(option) =>
			option.internal_feature_id === cusEnt.entitlement.internal_feature_id,
	);

	if (!options) return false;

	return true;
};
