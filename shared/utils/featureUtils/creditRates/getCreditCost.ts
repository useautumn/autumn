import { RecaseError } from "../../../api/errors/base/RecaseError.js";
import { ErrCode } from "../../../enums/ErrCode.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { isAiCreditSystem } from "../classifyFeature/isAiCreditSystem.js";
import { isAnyCreditSystem } from "../classifyFeature/isAnyCreditSystem.js";
import type { EventProperties } from "../creditDimensions/matchesEventProperties.js";
import { creditRateToCost } from "./creditRateToCost.js";
import { findCreditSchemaItemByFeatureId } from "./findCreditSchemaItemByFeatureId.js";

/** Credits `amount` units of `featureId` cost in `creditSystem`; the feature's own units when it is not a member. */
export const featureToCreditSystem = ({
	featureId,
	creditSystem,
	amount,
	currentUsage = 0,
	eventProperties,
}: {
	featureId: string;
	creditSystem: Feature;
	amount: number;
	currentUsage?: number;
	eventProperties?: EventProperties;
}) => {
	const schemaItem = findCreditSchemaItemByFeatureId({
		featureId,
		creditSystem,
		eventProperties,
	});
	if (schemaItem)
		return creditRateToCost({
			featureId,
			creditSystemId: creditSystem.id,
			rate: schemaItem,
			amount,
			currentUsage,
		});

	return amount;
};

/** Sync credit-schema math; token pricing (models.dev I/O) lives in getModelCreditCost. */
export const getCreditCost = ({
	featureId,
	creditSystem,
	amount = 1,
	currentUsage = 0,
	eventProperties,
}: {
	featureId: string;
	creditSystem: Feature;
	amount?: number;
	currentUsage?: number;
	eventProperties?: EventProperties;
}) => {
	if (!isAnyCreditSystem(creditSystem.type)) {
		return amount;
	}
	// Own balance is in the system's native unit (USD for AI), so values map 1:1.
	if (featureId === creditSystem.id) {
		return amount;
	}
	if (isAiCreditSystem(creditSystem.type)) {
		throw new RecaseError({
			message: `AI credit system ${creditSystem.id} has no schema; only its own feature can be priced here. Use getModelCreditCost for token pricing.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			data: { featureId, creditSystemId: creditSystem.id },
		});
	}
	const schemaItem = findCreditSchemaItemByFeatureId({
		featureId,
		creditSystem,
		eventProperties,
	});
	if (schemaItem)
		return creditRateToCost({
			featureId,
			creditSystemId: creditSystem.id,
			rate: schemaItem,
			amount,
			currentUsage,
		});

	throw new RecaseError({
		message: "Feature is not included in credit system schema",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { featureId, creditSystemId: creditSystem.id },
	});
};
