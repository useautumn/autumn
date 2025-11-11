import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { Feature } from "../../models/featureModels/featureModels.js";
import { notNullish, nullish } from "../utils.js";
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

export const filterOutEntityCusEnts = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.filter(
		(ce) =>
			nullish(ce.entitlement.entity_feature_id) &&
			nullish(ce.customer_product?.internal_entity_id),
	);
};

export const filterPerEntityCusEnts = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.filter((ce) => notNullish(ce.entitlement.entity_feature_id));
};

export const filterEntityProductCusEnts = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.filter((ce) =>
		notNullish(ce.customer_product?.internal_entity_id),
	);
};
