import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	isAnyCreditSystem,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	getModelCreditCost,
	type TokenInput,
} from "@/internal/features/aiCreditSystemUtils.js";

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

export const getCreditCost = async ({
	featureId,
	creditSystem,
	amount = 1,
	tokens,
	modelName,
}: {
	featureId: string;
	creditSystem: Feature;
	amount?: number;
	modelName?: string;
	tokens?: TokenInput;
}) => {
	if (!isAnyCreditSystem(creditSystem.type)) {
		return amount;
	}
	if (creditSystem.type === FeatureType.AiCreditSystem) {
		if (!tokens || !modelName) {
			throw new RecaseError({
				message: "modelName and tokens must be provided for AI credit systems",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
		return await getModelCreditCost({
			modelName,
			creditSystem,
			...tokens,
		});
	}
	// If tracking the credit system feature itself, 1:1 mapping
	if (featureId === creditSystem.id) {
		return amount;
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
	});
};
