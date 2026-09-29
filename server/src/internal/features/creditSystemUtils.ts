import {
	buildUsageAttributionKey,
	type CusProductStatus,
	cusEntToCurrentBalance,
	type EventProperties,
	entitlementToCreditSystem,
	type Feature,
	type FullSubject,
	featureToCreditSystem,
	findCreditSchemaItemByFeatureId,
	fullSubjectToCustomerEntitlements,
	getCreditRateFundedUnits,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

// The pure credit math lives in @autumn/shared so the balance engine can price the same way; these names stay importable here.
export {
	addCreditSystemMeteredFeatureIds,
	type CreditRateCard,
	type EventProperties,
	featureToCreditSystem,
	getCreditCost,
	getCreditRateCard,
	getCreditSystemsFromFeature,
	invalidCreditRateCard,
	isInvoiceCreditFeature,
	type ResolvedCreditSchemaItem,
	resolveCreditDimensionRate,
} from "@autumn/shared";

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
	const schemaItem = findCreditSchemaItemByFeatureId({
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
		const entitlementSchemaItem = findCreditSchemaItemByFeatureId({
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
