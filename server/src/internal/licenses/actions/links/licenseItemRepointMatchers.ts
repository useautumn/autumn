/** Pure matchers for re-pointing license item refs when base rows are
 * replaced: refs follow the replacement carrying the same feature. */

export const findEntitlementFollowingFeature = <
	E extends { internal_feature_id?: string | null },
>({
	internalFeatureId,
	replacementEntitlements,
}: {
	internalFeatureId: string | null | undefined;
	replacementEntitlements: E[];
}): E | undefined =>
	internalFeatureId
		? replacementEntitlements.find(
				(entitlement) => entitlement.internal_feature_id === internalFeatureId,
			)
		: undefined;

export const findPriceFollowingEntitlementFeature = <
	P extends { entitlement_id?: string | null },
>({
	internalFeatureId,
	replacementPrices,
	featureInternalIdOfPrice,
}: {
	internalFeatureId: string | null | undefined;
	replacementPrices: P[];
	featureInternalIdOfPrice: (price: P) => string | null | undefined;
}): P | undefined =>
	internalFeatureId
		? replacementPrices.find(
				(price) => featureInternalIdOfPrice(price) === internalFeatureId,
			)
		: undefined;

/** The base (no-feature) price slot: a price not tied to any entitlement. */
export const findBaseSlotReplacementPrice = <
	P extends { entitlement_id?: string | null },
>({
	replacementPrices,
}: {
	replacementPrices: P[];
}): P | undefined => replacementPrices.find((price) => !price.entitlement_id);
