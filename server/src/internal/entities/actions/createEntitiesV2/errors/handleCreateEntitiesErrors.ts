import {
	cusEntMatchesFeature,
	cusEntToCusPrice,
	EntityAlreadyExistsError,
	ErrCode,
	featureUtils,
	RecaseError,
} from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";
import type { CreateEntitiesContext } from "../types/createEntitiesContext.js";
import type { CreateEntitiesParams } from "../types/createEntitiesParams.js";
import type { EntitiesByFeature } from "../types/entitiesByFeature.js";

const refuseConsumableFeatures = ({
	entitiesByFeature,
}: CreateEntitiesContext) => {
	for (const { feature } of entitiesByFeature) {
		if (!featureUtils.isConsumable(feature)) continue;
		throw new RecaseError({
			message: `Feature '${feature.id}' is consumable (e.g. credits, API calls). Entities can only be created for non-consumable features (e.g. seats).`,
			statusCode: 400,
		});
	}
};

const refuseSecondIdlessEntity = ({
	existingEntities,
	requestedEntities,
}: CreateEntitiesContext) => {
	const existingIdless = existingEntities.filter(
		(entity) => entity.id === null,
	);
	const requestedIdless = requestedEntities.filter(
		(entity) => entity.id === null,
	);
	if (existingIdless.length + requestedIdless.length <= 1) return;
	throw new RecaseError({
		message:
			"Each entity must have a unique id; only one entity per customer may omit an id.",
		code: ErrCode.EntityIdRequired,
		statusCode: 400,
	});
};

const refuseExistingEntityIds = ({
	existingEntities,
}: CreateEntitiesContext) => {
	for (const entity of existingEntities) {
		if (entity.id === null) continue;
		throw new EntityAlreadyExistsError({
			entityId: entity.id ?? entity.internal_id,
		});
	}
};

const refuseEntitiesForFeature = ({
	context,
	entitiesByFeature,
	params,
}: {
	context: CreateEntitiesContext;
	entitiesByFeature: EntitiesByFeature;
	params: CreateEntitiesParams;
}) => {
	const { feature, inserted } = entitiesByFeature;
	const featureCustomerEntitlements = context.customerEntitlements.filter(
		(cusEnt) => cusEntMatchesFeature({ cusEnt, feature }),
	);

	for (const customerEntitlement of featureCustomerEntitlements) {
		const hasPrice = notNullish(
			cusEntToCusPrice({ cusEnt: customerEntitlement }),
		);
		if (hasPrice && !params.allowPaidFeatures) {
			throw new RecaseError({
				message: `Failed to auto create entity for feature ${feature.name} because it is a paid feature.`,
				code: ErrCode.InvalidInputs,
				statusCode: 400,
			});
		}

		const usageLimit = customerEntitlement.entitlement.usage_limit;
		const balanceAfter = (customerEntitlement.balance ?? 0) - inserted.length;
		if (notNullish(usageLimit) && balanceAfter < -usageLimit) {
			throw new RecaseError({
				message: `Cannot create ${inserted.length} entities for feature ${feature.name} as it would exceed the usage limit.`,
				code: ErrCode.FeatureLimitReached,
				statusCode: 400,
			});
		}
	}
};

const refuseSeveralInvoicedFeatures = ({
	invoicedCustomerEntitlements,
}: CreateEntitiesContext) => {
	if (invoicedCustomerEntitlements.length <= 1) return;
	throw new RecaseError({
		message:
			"Entities for more than one paid feature must be created in separate requests.",
		code: ErrCode.InvalidInputs,
		statusCode: 400,
	});
};

export const handleCreateEntitiesErrors = ({
	context,
	params,
}: {
	context: CreateEntitiesContext;
	params: CreateEntitiesParams;
}) => {
	refuseConsumableFeatures(context);
	refuseSecondIdlessEntity(context);
	refuseExistingEntityIds(context);
	for (const entitiesByFeature of context.entitiesByFeature) {
		refuseEntitiesForFeature({ context, entitiesByFeature, params });
	}
	refuseSeveralInvoicedFeatures(context);
};
