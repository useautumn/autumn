import type { Entity } from "../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
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

	// Check 1: customer_product level entity (entity-level products)
	let cusProductMatch = true;
	if (notNullish(cusEnt.customer_product?.internal_entity_id)) {
		cusProductMatch =
			cusEnt.customer_product.internal_entity_id === entity.internal_id;
	}

	// Check 2: entity_feature_id match (per-entity features)
	let entityFeatureIdMatch = true;
	if (notNullish(cusEnt.entitlement.entity_feature_id)) {
		entityFeatureIdMatch =
			cusEnt.entitlement.entity_feature_id === entity.feature_id;
	}

	// Check 3: cusEnt-level entity (for loose entitlements / extra_customer_entitlements)
	let cusEntEntityMatch = true;
	if (notNullish(cusEnt.internal_entity_id)) {
		// NEW APPROACH: direct internal_entity_id on the customer_entitlement row
		cusEntEntityMatch = cusEnt.internal_entity_id === entity.internal_id;
	} else if (cusEnt.entities && Object.keys(cusEnt.entities).length > 0) {
		// OLD APPROACH: entities object uses external entity.id as keys
		cusEntEntityMatch = entity.id !== null && entity.id in cusEnt.entities;
	}

	return cusProductMatch && entityFeatureIdMatch && cusEntEntityMatch;
};

export const filterOutEntityCusEnts = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return cusEnts.filter(
		(ce) =>
			nullish(ce.customer_product?.internal_entity_id) &&
			nullish(ce.internal_entity_id),
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

export const cusEntMatchesFeature = ({
	cusEnt,
	feature,
}: {
	cusEnt: FullCustomerEntitlement;
	feature: Feature;
}) => {
	return cusEnt.entitlement.feature.internal_id === feature.internal_id;
};
