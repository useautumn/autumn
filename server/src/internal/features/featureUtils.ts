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

export const validateCreditSystem = (config: CreditSystemConfig) => {
	const schema = config.schema;
	if (!schema || schema.length === 0) {
		throw new RecaseError({
			message: `At least one metered feature is required for credit system`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	// Check if multiple of the same feature
	const meteredFeatureIds = schema.map(
		(schemaItem) => schemaItem.metered_feature_id,
	);
	// console.log("Metered feature ids:", meteredFeatureIds);
	const uniqueMeteredFeatureIds = Array.from(new Set(meteredFeatureIds));
	if (meteredFeatureIds.length !== uniqueMeteredFeatureIds.length) {
		throw new RecaseError({
			message: `Credit system contains multiple of the same metered_feature_id`,
			code: ErrCode.InvalidFeature,
			statusCode: 400,
		});
	}

	const newConfig = { ...config, usage_type: FeatureUsageType.Single };
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
