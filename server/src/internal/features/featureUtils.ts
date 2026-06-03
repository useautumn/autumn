import {
	ApiFeatureType,
	type CreditSystemConfig,
	cusProductsToCusPrices,
	ErrCode,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCustomer,
	isAllocatedPrice,
	type MeteredConfig,
	type UsagePriceConfig,
} from "@autumn/shared";
import { ACTIVE_STATUSES } from "@server/internal/customers/cusProducts/CusProductService";
import RecaseError from "@server/utils/errorUtils";
import { StatusCodes } from "http-status-codes";

export const validateFeatureId = (featureId: string) => {
	if (!featureId.match(/^[a-zA-Z0-9_-]+$/)) {
		throw new RecaseError({
			message:
				"Feature ID can only contain alphanumeric characters, underscores, and hyphens",
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}
	return;
};

export const validateMeteredConfig = (config: MeteredConfig) => {
	const newConfig = { ...config };

	if (!config.usage_type) {
		throw new RecaseError({
			message: `Usage type (single or continuous) is required for metered feature`,
			code: ErrCode.InvalidFeature,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	return newConfig as MeteredConfig;
};

export const validateCreditSystem = (
	config: CreditSystemConfig,
	featureType: FeatureType = FeatureType.CreditSystem,
) => {
	const isAiCreditSystem = featureType === FeatureType.AiCreditSystem;
	const schema = Array.isArray(config?.schema) ? config.schema : [];

	if (!isAiCreditSystem && schema.length === 0) {
		throw new RecaseError({
			message: `At least one metered feature is required for credit system`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	if (isAiCreditSystem && schema.length > 0) {
		throw new RecaseError({
			message: `AI credit systems are leaf features and cannot define a schema. Model rates live in model_markups.`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	const meteredFeatureIds = schema.map(
		(schemaItem) => schemaItem.metered_feature_id,
	);
	const uniqueMeteredFeatureIds = Array.from(new Set(meteredFeatureIds));
	if (meteredFeatureIds.length !== uniqueMeteredFeatureIds.length) {
		throw new RecaseError({
			message: `Credit system contains multiple of the same metered_feature_id`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	const newConfig = { ...config, schema, usage_type: FeatureUsageType.Single };
	const defaultMarkup = newConfig.default_markup;
	if (defaultMarkup != null) {
		const parsedDefaultMarkup = Number(defaultMarkup);
		if (Number.isNaN(parsedDefaultMarkup) || parsedDefaultMarkup < 0) {
			throw new RecaseError({
				message: "Default markup should be a non-negative number",
				code: ErrCode.InvalidFeature,
				statusCode: 400,
			});
		}
		newConfig.default_markup = parsedDefaultMarkup;
	}

	const providerMarkups = newConfig.provider_markups;
	if (providerMarkups != null) {
		for (const [provider, entry] of Object.entries(providerMarkups)) {
			const markup = Number(entry?.markup);
			if (!provider || Number.isNaN(markup) || markup < 0) {
				throw new RecaseError({
					message: "Provider markups must be non-negative numbers",
					code: ErrCode.InvalidFeature,
					statusCode: 400,
				});
			}
			entry.markup = markup;
		}
	}

	for (let i = 0; i < newConfig.schema.length; i++) {
		const creditAmount = parseFloat(
			newConfig.schema[i].credit_amount.toString(),
		);

		if (Number.isNaN(creditAmount)) {
			throw new RecaseError({
				message: `Credit amount should be a number`,
				code: ErrCode.InvalidFeature,
				statusCode: 400,
			});
		}

		newConfig.schema[i].credit_amount = creditAmount;
	}

	return newConfig;
};

/**
 * Validates that every feature referenced by a credit system's schema is a
 * Metered or AiCreditSystem feature. Rejects nesting one CreditSystem inside
 * another — composition is capped at two levels (parent credit system → leaf).
 *
 * Self-references are tolerated (the create flow doesn't yet have the new id
 * in the features list, and updates simply read back as the feature itself).
 */
export const validateCreditSystemSchemaReferences = ({
	config,
	allFeatures,
	selfFeatureId,
}: {
	config: CreditSystemConfig;
	allFeatures: Feature[];
	selfFeatureId?: string;
}) => {
	const schema = Array.isArray(config?.schema) ? config.schema : [];
	if (schema.length === 0) return;

	for (const item of schema) {
		const referencedId = item.metered_feature_id;
		if (!referencedId || referencedId === selfFeatureId) continue;

		const referenced = allFeatures.find((f) => f.id === referencedId);
		if (!referenced) continue;

		if (referenced.type === FeatureType.CreditSystem) {
			throw new RecaseError({
				message: `Credit system schema cannot reference another credit system (${referencedId}). Only metered or AI credit features are allowed.`,
				code: ErrCode.InvalidFeature,
				statusCode: 400,
			});
		}
	}
};

const getCusFeatureType = ({ feature }: { feature: Feature }) => {
	if (feature.type === FeatureType.Boolean) {
		return ApiFeatureType.Static;
	} else if (feature.type === FeatureType.Metered) {
		if (feature.config.usage_type === FeatureUsageType.Single) {
			return ApiFeatureType.SingleUsage;
		} else {
			return ApiFeatureType.ContinuousUse;
		}
	} else {
		return ApiFeatureType.SingleUsage;
	}
};

const isCreditSystem = ({ feature }: { feature: Feature }) => {
	return feature.type === FeatureType.CreditSystem;
};

export const isPaidContinuousUse = ({
	feature,
	fullCus,
}: {
	feature: Feature;
	fullCus: FullCustomer;
}) => {
	const isContinuous =
		feature.config?.usage_type === FeatureUsageType.Continuous;

	if (!isContinuous) {
		return false;
	}

	const cusPrices = cusProductsToCusPrices({
		cusProducts: fullCus.customer_products,
		inStatuses: ACTIVE_STATUSES,
	});

	const hasPaid = cusPrices.some((cp) => {
		const config = cp.price.config as UsagePriceConfig;

		const featureIdMatches = config.internal_feature_id === feature.internal_id;
		const allocatedPrice = isAllocatedPrice(cp.price);

		return featureIdMatches && allocatedPrice;
	});

	return hasPaid;
};
