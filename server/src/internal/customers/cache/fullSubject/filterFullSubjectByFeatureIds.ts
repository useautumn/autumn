import type { FullSubject, NormalizedFullSubject } from "@autumn/shared";

export const filterNormalizedFullSubjectByFeatureIds = ({
	normalized,
	featureIds,
}: {
	normalized: NormalizedFullSubject;
	featureIds: string[];
}): NormalizedFullSubject => {
	const featureIdSet = new Set(featureIds);

	return {
		...normalized,
		customer_entitlements: normalized.customer_entitlements.filter((balance) =>
			featureIdSet.has(balance.feature_id),
		),
		flags: Object.fromEntries(
			Object.entries(normalized.flags).filter(([featureId]) =>
				featureIdSet.has(featureId),
			),
		),
		entity_aggregations: normalized.entity_aggregations
			? {
					...normalized.entity_aggregations,
					aggregated_customer_entitlements:
						normalized.entity_aggregations.aggregated_customer_entitlements.filter(
							(balance) => featureIdSet.has(balance.feature_id),
						),
				}
			: undefined,
	};
};

export const filterFullSubjectByFeatureIds = ({
	fullSubject,
	featureIds,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
}): FullSubject => {
	const featureIdSet = new Set(featureIds);

	return {
		...fullSubject,
		customer_products: fullSubject.customer_products.map((customerProduct) => ({
			...customerProduct,
			customer_entitlements: customerProduct.customer_entitlements.filter(
				(customerEntitlement) =>
					featureIdSet.has(customerEntitlement.entitlement.feature.id),
			),
		})),
		extra_customer_entitlements: fullSubject.extra_customer_entitlements.filter(
			(customerEntitlement) =>
				featureIdSet.has(customerEntitlement.entitlement.feature.id),
		),
		aggregated_customer_entitlements:
			fullSubject.aggregated_customer_entitlements?.filter((balance) =>
				featureIdSet.has(balance.feature_id),
			),
	};
};
