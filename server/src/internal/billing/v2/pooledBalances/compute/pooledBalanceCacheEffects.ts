import { Decimal } from "decimal.js";

export type PooledBalanceCacheEffect = {
	featureId: string;
	customerEntitlementId: string;
	balanceDelta: number;
	adjustmentDelta: number;
	expectedBalance?: number;
	expectedAdjustment?: number | null;
};

const effectKey = ({
	featureId,
	customerEntitlementId,
}: Pick<PooledBalanceCacheEffect, "featureId" | "customerEntitlementId">) =>
	`${featureId}\u0000${customerEntitlementId}`;

export const coalescePooledBalanceCacheEffects = ({
	effects,
}: {
	effects: PooledBalanceCacheEffect[];
}): PooledBalanceCacheEffect[] => {
	const effectsByKey = new Map<string, PooledBalanceCacheEffect>();

	for (const effect of effects) {
		const key = effectKey(effect);
		const previous = effectsByKey.get(key);
		effectsByKey.set(key, {
			featureId: effect.featureId,
			customerEntitlementId: effect.customerEntitlementId,
			balanceDelta: new Decimal(previous?.balanceDelta ?? 0)
				.plus(effect.balanceDelta)
				.toNumber(),
			adjustmentDelta: new Decimal(previous?.adjustmentDelta ?? 0)
				.plus(effect.adjustmentDelta)
				.toNumber(),
			expectedBalance: effect.expectedBalance ?? previous?.expectedBalance,
			expectedAdjustment:
				effect.expectedAdjustment ?? previous?.expectedAdjustment,
		});
	}

	return [...effectsByKey.values()].filter(
		({ balanceDelta, adjustmentDelta }) =>
			balanceDelta !== 0 || adjustmentDelta !== 0,
	);
};
