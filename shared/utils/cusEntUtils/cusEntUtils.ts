import type {
	EntityBalance,
	FullCustomerEntitlement,
} from "@models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomer } from "../../models/cusModels/fullCusModel.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { notNullish } from "../utils.js";

export const formatCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return `${cusEnt.entitlement.feature_id} (${cusEnt.entitlement.interval}) (${cusEnt.balance})`;
};

export const updateCusEntInFullCus = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: {
		balance: number;
		entities: Record<string, EntityBalance> | undefined;
		adjustment: number;
	};
}) => {
	for (let i = 0; i < fullCus.customer_products.length; i++) {
		for (
			let j = 0;
			j < fullCus.customer_products[i].customer_entitlements.length;
			j++
		) {
			const ce = fullCus.customer_products[i].customer_entitlements[j];
			if (ce.id === cusEntId) {
				fullCus.customer_products[i].customer_entitlements[j] = {
					...ce,
					balance: update.balance,
					entities: update.entities,
					adjustment: update.adjustment,
				};
			}
		}
	}
};
export const cusEntMatchesEntity = ({
	cusEnt,
	entity,
	features,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entity?: Entity;
	features?: Feature[];
}) => {
	if (!entity) return true;

	let cusProductMatch = true;

	if (notNullish(cusEnt.customer_product?.internal_entity_id)) {
		cusProductMatch =
			cusEnt.customer_product.internal_entity_id === entity.internal_id;
	}

	let entityFeatureIdMatch = true;
	// let feature = features?.find(
	//   (f) => f.id == cusEnt.entitlement.entity_feature_id,
	// );

	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
		entityFeatureIdMatch =
			cusEnt.entitlement.entity_feature_id === entity.feature_id;
	}

	return cusProductMatch && entityFeatureIdMatch;
};
