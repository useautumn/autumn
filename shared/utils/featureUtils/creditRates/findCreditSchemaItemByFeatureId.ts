import type { CreditSchemaItem } from "../../../models/featureModels/featureConfig/creditConfig.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";
import { hasCreditDimensionRules } from "../classifyFeature/hasCreditDimensionRules.js";
import type { EventProperties } from "../creditDimensions/matchesEventProperties.js";
import {
	type ResolvedCreditSchemaItem,
	resolveCreditDimensionRate,
} from "../creditDimensions/resolveCreditDimensionRate.js";

/** The row for a feature, with its dimension rules applied to the event — always a plain flat or graduated rate. */
export const findCreditSchemaItemByFeatureId = ({
	featureId,
	creditSystem,
	eventProperties,
}: {
	featureId: string;
	creditSystem: Feature;
	eventProperties?: EventProperties;
}): ResolvedCreditSchemaItem | undefined => {
	const schema: CreditSchemaItem[] = creditSystem.config.schema;
	const schemaItem = schema.find(
		(schemaItem) => schemaItem.metered_feature_id === featureId,
	);
	if (!schemaItem || !hasCreditDimensionRules(schemaItem)) return schemaItem;

	return resolveCreditDimensionRate({
		schemaItem,
		eventProperties,
		creditSystemId: creditSystem.id,
	});
};
