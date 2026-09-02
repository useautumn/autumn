import {
	buildUsageAttributionKey,
	type CreditSchemaItem,
	type CreditTier,
	type CusProductStatus,
	cusEntToCurrentBalance,
	ErrCode,
	entitlementToCreditSystem,
	type Feature,
	FeatureType,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	hasCreditDimensionRules,
	isAiCreditSystem,
	isAnyCreditSystem,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	type EventProperties,
	type ResolvedCreditSchemaItem,
	resolveCreditDimensionRate,
} from "./creditDimensions/resolveCreditDimensionRate.js";

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

export const isInvoiceCreditFeature = ({
	feature,
}: {
	feature?: Feature;
}): boolean =>
	feature?.type === FeatureType.CreditSystem &&
	feature.config?.invoice_credit === true;

export const isEnablingInvoiceCreditFeature = ({
	currentFeature,
	nextFeature,
}: {
	currentFeature: Feature;
	nextFeature: Feature;
}): boolean =>
	!isInvoiceCreditFeature({ feature: currentFeature }) &&
	isInvoiceCreditFeature({ feature: nextFeature });

export const invalidCreditRateCard = ({
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

/** The row for a feature, with its dimension rules applied to the event — always a plain flat or graduated rate. */
const getCreditSchemaItem = ({
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

export const getCreditRateCard = ({
	sourceFeature,
	creditSystem,
	eventProperties,
}: {
	sourceFeature: Feature;
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

	const schemaItem = getCreditSchemaItem({
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

const getCreditRateFundedUnits = ({
	featureId,
	creditSystem,
	currentUsage,
	requestedUnits,
	availableCredits,
	eventProperties,
}: {
	featureId: string;
	creditSystem: Feature;
	currentUsage: number;
	requestedUnits: number;
	availableCredits: number;
	eventProperties?: EventProperties;
}): number => {
	if (requestedUnits <= 0) return 0;
	const requestedCredits = featureToCreditSystem({
		featureId,
		creditSystem,
		amount: requestedUnits,
		currentUsage,
		eventProperties,
	});
	if (requestedCredits <= availableCredits) return requestedUnits;
	if (availableCredits <= 0) return 0;

	let lowerBound = 0;
	let upperBound = requestedUnits;
	for (let iteration = 0; iteration < 60; iteration++) {
		const candidateUnits = new Decimal(lowerBound)
			.add(upperBound)
			.div(2)
			.toNumber();
		const candidateCredits = featureToCreditSystem({
			featureId,
			creditSystem,
			amount: candidateUnits,
			currentUsage,
			eventProperties,
		});
		if (candidateCredits <= availableCredits) {
			lowerBound = candidateUnits;
		} else {
			upperBound = candidateUnits;
		}
	}

	return lowerBound;
};

export const getCreditRateRequiredBalance = ({
	fullSubject,
	sourceFeature,
	creditSystem,
	amount,
	reverseOrder = false,
	inStatuses,
	eventProperties,
}: {
	fullSubject: FullSubject;
	sourceFeature: Feature;
	creditSystem: Feature;
	amount: number;
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
	eventProperties?: EventProperties;
}): number => {
	// Only this credit system's entitlements that actually fund the source
	// feature under their effective schema (an override may have removed it).
	const customerEntitlements = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [creditSystem.id],
		fundsFeatureId: sourceFeature.id,
		reverseOrder,
		inStatuses,
	});

	// A flat catalog rate converts without walking entitlements — unless one
	// of them carries a feature_override, whose rate (possibly graduated)
	// applies to the credits it funds.
	const schemaItem = getCreditSchemaItem({
		featureId: sourceFeature.id,
		creditSystem,
		eventProperties,
	});
	const hasOverriddenEntitlement = customerEntitlements.some(
		(customerEntitlement) => customerEntitlement.entitlement.feature_override,
	);
	if (
		customerEntitlements.length === 0 ||
		(schemaItem?.tier_behavior !== "graduated" && !hasOverriddenEntitlement)
	) {
		return featureToCreditSystem({
			featureId: sourceFeature.id,
			creditSystem,
			amount,
			eventProperties,
		});
	}

	let remainingUnits = new Decimal(amount);
	let requiredCredits = new Decimal(0);
	let finalUsage = 0;
	let finalCreditSystem = creditSystem;

	for (const customerEntitlement of customerEntitlements) {
		if (remainingUnits.lte(0)) break;
		const entitlementCreditSystem = entitlementToCreditSystem({
			entitlement: customerEntitlement.entitlement,
		});
		const entitlementSchemaItem = getCreditSchemaItem({
			featureId: sourceFeature.id,
			creditSystem: entitlementCreditSystem,
			eventProperties,
		});
		const attributionKey = buildUsageAttributionKey({
			internalFeatureId: sourceFeature.internal_id,
			dimensionName: entitlementSchemaItem?.dimension_name,
		});
		const currentUsage =
			customerEntitlement.usage_attribution?.[attributionKey]?.units ?? 0;
		const availableCredits = cusEntToCurrentBalance({
			cusEnt: customerEntitlement,
			entityId: fullSubject.entity?.id ?? undefined,
			withRollovers: true,
		});
		const fundedUnits = getCreditRateFundedUnits({
			featureId: sourceFeature.id,
			creditSystem: entitlementCreditSystem,
			currentUsage,
			requestedUnits: remainingUnits.toNumber(),
			availableCredits,
			eventProperties,
		});
		const fundedCredits = featureToCreditSystem({
			featureId: sourceFeature.id,
			creditSystem: entitlementCreditSystem,
			amount: fundedUnits,
			currentUsage,
			eventProperties,
		});
		requiredCredits = requiredCredits.add(fundedCredits);
		remainingUnits = remainingUnits.sub(fundedUnits);
		finalUsage = currentUsage + fundedUnits;
		finalCreditSystem = entitlementCreditSystem;

		if (remainingUnits.lte(1e-10)) return requiredCredits.toNumber();
	}

	return requiredCredits
		.add(
			featureToCreditSystem({
				featureId: sourceFeature.id,
				creditSystem: finalCreditSystem,
				amount: remainingUnits.toNumber(),
				currentUsage: finalUsage,
				eventProperties,
			}),
		)
		.toNumber();
};

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
	const schemaItem = getCreditSchemaItem({
		featureId,
		creditSystem,
		eventProperties,
	});
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
	const schemaItem = getCreditSchemaItem({
		featureId,
		creditSystem,
		eventProperties,
	});
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
