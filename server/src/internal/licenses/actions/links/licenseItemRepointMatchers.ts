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

/** The base (no-feature) price slot: a price not tied to any entitlement.
 * With several base prices, the previous price's config disambiguates. */
export const findBaseSlotReplacementPrice = <
	P extends { entitlement_id?: string | null; config?: unknown },
>({
	replacementPrices,
	previousPrice,
}: {
	replacementPrices: P[];
	previousPrice?: { config?: unknown };
}): P | undefined => {
	const candidates = replacementPrices.filter((price) => !price.entitlement_id);
	if (candidates.length <= 1 || !previousPrice) return candidates[0];

	const configKey = (config: unknown) => {
		const { interval, interval_count, amount } = (config ?? {}) as {
			interval?: string;
			interval_count?: number;
			amount?: number;
		};
		return `${interval}:${interval_count}:${amount}`;
	};
	return (
		candidates.find(
			(price) => configKey(price.config) === configKey(previousPrice.config),
		) ?? candidates[0]
	);
};
