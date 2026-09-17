import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { buildUsageAttributionKey } from "../../cusEntUtils/usageAttribution/buildUsageAttributionKey.js";
import type { EventProperties } from "../creditDimensions/matchesEventProperties.js";
import type { CreditRateCard } from "./creditRateCard.js";
import { findCreditSchemaItemByFeatureId } from "./findCreditSchemaItemByFeatureId.js";

/** The rate card a credit system charges `sourceFeature` at, when it attributes usage (invoice credits, graduated tiers). */
export const getCreditRateCard = ({
	sourceFeature,
	creditSystem,
	eventProperties,
}: {
	sourceFeature: Pick<Feature, "id" | "internal_id">;
	creditSystem: Feature;
	eventProperties?: EventProperties;
}): CreditRateCard | undefined => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		return undefined;
	}

	if (sourceFeature.id === creditSystem.id) {
		return creditSystem.config.invoice_credit
			? {
					source_internal_feature_id: sourceFeature.internal_id,
					feature_amount: 1,
					credit_amount: 1,
				}
			: undefined;
	}

	const schemaItem = findCreditSchemaItemByFeatureId({
		featureId: sourceFeature.id,
		creditSystem,
		eventProperties,
	});
	if (!schemaItem) return undefined;

	const base = {
		source_internal_feature_id: buildUsageAttributionKey({
			internalFeatureId: sourceFeature.internal_id,
			dimensionName: schemaItem.dimension_name,
		}),
		feature_amount: schemaItem.feature_amount ?? 1,
	};
	if (schemaItem.tier_behavior === "graduated") {
		return {
			...base,
			tier_behavior: "graduated",
			tiers: schemaItem.tiers,
		};
	}

	return creditSystem.config.invoice_credit
		? {
				...base,
				credit_amount: schemaItem.credit_amount,
			}
		: undefined;
};
