import {
	type CreditSchemaItem,
	DocsLinks,
	ErrCode,
	type Feature,
	FeatureType,
	isAiCreditSystem,
	isAnyCreditSystem,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

const creditSystemContainsFeature = ({
	creditSystem,
	meteredFeatureId,
}: {
	creditSystem: Feature;
	meteredFeatureId: string;
}) => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		return false;
	}
	const schema: CreditSchemaItem[] | undefined = creditSystem.config?.schema;
	if (!schema) return false;

	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === meteredFeatureId) {
			return true;
		}
	}

	return false;
};

export const getCreditSystemsFromFeature = ({
	featureId,
	features,
}: {
	featureId: string;
	features: Feature[];
}) => {
	return features.filter(
		(f) =>
			f.type === FeatureType.CreditSystem &&
			f.id !== featureId &&
			creditSystemContainsFeature({
				creditSystem: f,
				meteredFeatureId: featureId,
			}),
	);
};

export const featureToCreditSystem = ({
	featureId,
	creditSystem,
	amount,
}: {
	featureId: string;
	creditSystem: Feature;
	amount: number;
}) => {
	const schema: CreditSchemaItem[] = creditSystem.config.schema;

	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === featureId) {
			const creditAmount = schemaItem.credit_amount;
			const featureAmount = schemaItem.feature_amount ?? 1;

			return new Decimal(creditAmount)
				.div(featureAmount)
				.mul(amount)
				.toNumber();
		}
	}

	return amount;
};

/** Sync credit-schema math; token pricing (models.dev I/O) lives in getModelCreditCost. */
export const getCreditCost = ({
	featureId,
	creditSystem,
	amount = 1,
}: {
	featureId: string;
	creditSystem: Feature;
	amount?: number;
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
	const schema: CreditSchemaItem[] = creditSystem.config.schema;
	for (const schemaItem of schema) {
		if (schemaItem.metered_feature_id === featureId) {
			return new Decimal(schemaItem.credit_amount)
				.div(schemaItem.feature_amount ?? 1)
				.mul(amount)
				.toNumber();
		}
	}

	throw new RecaseError({
		message: "Feature is not included in credit system schema",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { featureId, creditSystemId: creditSystem.id },
		docsUrl: DocsLinks.UsingEventNames,
	});
};
