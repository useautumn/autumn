import {
	type CreditSchemaItem,
	type CreditTier,
	ErrCode,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	isAiCreditSystem,
	isAnyCreditSystem,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

export type CreditRateCard = {
	source_internal_feature_id: string;
	feature_amount: number;
} & (
	| {
			credit_amount: number;
			tier_behavior?: never;
			tiers?: never;
	  }
	| {
			credit_amount?: never;
			tier_behavior: "graduated";
			tiers: CreditTier[];
	  }
);

const invalidCreditRateCard = ({
	featureId,
	creditSystemId,
	message,
}: {
	featureId: string;
	creditSystemId: string;
	message: string;
}) =>
	new RecaseError({
		message,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
		data: { featureId, creditSystemId },
	});

const getGraduatedCreditCostAtUsage = ({
	featureId,
	creditSystemId,
	schemaItem,
	usage,
}: {
	featureId: string;
	creditSystemId: string;
	schemaItem: Extract<CreditSchemaItem, { tier_behavior: "graduated" }>;
	usage: number;
}) => {
	const featureAmount = schemaItem.feature_amount ?? 1;
	if (!Number.isFinite(featureAmount) || featureAmount <= 0) {
		throw invalidCreditRateCard({
			featureId,
			creditSystemId,
			message: "Credit rate-card billing units must be greater than zero",
		});
	}

	if (schemaItem.tiers.length === 0) {
		throw invalidCreditRateCard({
			featureId,
			creditSystemId,
			message: "Graduated credit rate cards require at least one tier",
		});
	}

	const boundedUsage = Decimal.max(new Decimal(usage), 0);
	let previousBoundary = new Decimal(0);
	let totalCost = new Decimal(0);

	for (const [index, tier] of schemaItem.tiers.entries()) {
		if (!Number.isFinite(tier.credit_amount) || tier.credit_amount < 0) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "Credit tier costs must be finite and non-negative",
			});
		}

		const isLastTier = index === schemaItem.tiers.length - 1;
		if (tier.to === "inf") {
			if (!isLastTier) {
				throw invalidCreditRateCard({
					featureId,
					creditSystemId,
					message: "Only the final credit tier may have an infinite boundary",
				});
			}

			const tierUnits = Decimal.max(boundedUsage.minus(previousBoundary), 0);
			return totalCost.plus(
				tierUnits.div(featureAmount).mul(tier.credit_amount),
			);
		}

		if (!Number.isFinite(tier.to) || tier.to <= previousBoundary.toNumber()) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "Credit tier boundaries must be strictly increasing",
			});
		}

		if (isLastTier) {
			throw invalidCreditRateCard({
				featureId,
				creditSystemId,
				message: "The final credit tier must have an infinite boundary",
			});
		}

		const boundary = new Decimal(tier.to);
		const tierUnits = Decimal.max(
			Decimal.min(boundedUsage, boundary).minus(previousBoundary),
			0,
		);
		totalCost = totalCost.plus(
			tierUnits.div(featureAmount).mul(tier.credit_amount),
		);
		previousBoundary = boundary;

		if (boundedUsage.lte(boundary)) return totalCost;
	}

	throw invalidCreditRateCard({
		featureId,
		creditSystemId,
		message: "The final credit tier must have an infinite boundary",
	});
};

const getSchemaItemCreditCost = ({
	featureId,
	creditSystemId,
	schemaItem,
	amount,
	currentUsage,
}: {
	featureId: string;
	creditSystemId: string;
	schemaItem: CreditSchemaItem;
	amount: number;
	currentUsage: number;
}) => {
	if (schemaItem.tier_behavior === "graduated") {
		const beforeCost = getGraduatedCreditCostAtUsage({
			featureId,
			creditSystemId,
			schemaItem,
			usage: currentUsage,
		});
		const afterCost = getGraduatedCreditCostAtUsage({
			featureId,
			creditSystemId,
			schemaItem,
			usage: Math.max(0, new Decimal(currentUsage).plus(amount).toNumber()),
		});
		return afterCost.minus(beforeCost).toNumber();
	}

	return new Decimal(schemaItem.credit_amount)
		.div(schemaItem.feature_amount ?? 1)
		.mul(amount)
		.toNumber();
};

const getCreditSchemaItem = ({
	featureId,
	creditSystem,
}: {
	featureId: string;
	creditSystem: Feature;
}) => {
	const schema: CreditSchemaItem[] = creditSystem.config.schema;
	return schema.find(
		(schemaItem) => schemaItem.metered_feature_id === featureId,
	);
};

export const getCreditRateCard = ({
	sourceFeature,
	creditSystem,
}: {
	sourceFeature: Feature;
	creditSystem: Feature;
}): CreditRateCard | undefined => {
	if (
		creditSystem.type !== FeatureType.CreditSystem ||
		sourceFeature.id === creditSystem.id
	) {
		return undefined;
	}

	const schemaItem = getCreditSchemaItem({
		featureId: sourceFeature.id,
		creditSystem,
	});
	if (!schemaItem || schemaItem.tier_behavior !== "graduated") return undefined;

	const base = {
		source_internal_feature_id: sourceFeature.internal_id,
		feature_amount: schemaItem.feature_amount ?? 1,
	};
	return {
		...base,
		tier_behavior: "graduated",
		tiers: schemaItem.tiers,
	};
};

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

/** Adds the metered features each selected credit system draws from. */
export const addCreditSystemMeteredFeatureIds = ({
	features,
	featureIds,
}: {
	features: Feature[];
	featureIds: Set<string>;
}) => {
	for (const feature of features) {
		if (!isAnyCreditSystem(feature.type)) continue;
		if (!featureIds.has(feature.id)) continue;
		const schema: CreditSchemaItem[] | undefined = feature.config?.schema;
		for (const schemaItem of schema ?? []) {
			featureIds.add(schemaItem.metered_feature_id);
		}
	}
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

export const getCreditRateCurrentUsage = ({
	fullSubject,
	creditSystemId,
	sourceInternalFeatureId,
}: {
	fullSubject: FullSubject;
	creditSystemId: string;
	sourceInternalFeatureId: string;
}) => {
	const customerEntitlement = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [creditSystemId],
	})[0];

	return (
		customerEntitlement?.usage_attribution?.[sourceInternalFeatureId]?.units ??
		0
	);
};

export const featureToCreditSystem = ({
	featureId,
	creditSystem,
	amount,
	currentUsage = 0,
}: {
	featureId: string;
	creditSystem: Feature;
	amount: number;
	currentUsage?: number;
}) => {
	const schemaItem = getCreditSchemaItem({ featureId, creditSystem });
	if (schemaItem)
		return getSchemaItemCreditCost({
			featureId,
			creditSystemId: creditSystem.id,
			schemaItem,
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
}: {
	featureId: string;
	creditSystem: Feature;
	amount?: number;
	currentUsage?: number;
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
	const schemaItem = getCreditSchemaItem({ featureId, creditSystem });
	if (schemaItem)
		return getSchemaItemCreditCost({
			featureId,
			creditSystemId: creditSystem.id,
			schemaItem,
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
