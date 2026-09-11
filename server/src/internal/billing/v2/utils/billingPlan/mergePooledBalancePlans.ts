import {
	addSafe,
	type PooledBalancePlan,
	type PooledBalanceUpdate,
} from "@autumn/shared";
import { mergeById, mergeByKey } from "./mergeByKey";

export const mergePooledBalancePlans = ({
	base,
	incoming,
}: {
	base?: PooledBalancePlan;
	incoming?: PooledBalancePlan;
}): PooledBalancePlan | undefined => {
	if (!base && !incoming) return undefined;

	return {
		insertPoolBalances:
			mergeByKey({
				base: base?.insertPoolBalances,
				incoming: incoming?.insertPoolBalances,
				getKey: (pooledCustomerEntitlement) => pooledCustomerEntitlement.id,
			}) ?? [],
		updatePoolBalances: mergePooledBalanceUpdates({
			base: base?.updatePoolBalances,
			incoming: incoming?.updatePoolBalances,
		}),
		expirePoolBalanceCandidates:
			mergeByKey({
				base: base?.expirePoolBalanceCandidates,
				incoming: incoming?.expirePoolBalanceCandidates,
				getKey: (expiry) => expiry.pooledCustomerEntitlement.id,
			}) ?? [],
		insertPoolRollovers: mergeById({
			base: base?.insertPoolRollovers,
			incoming: incoming?.insertPoolRollovers,
		}),
		insertPoolContributions: mergeById({
			base: base?.insertPoolContributions,
			incoming: incoming?.insertPoolContributions,
		}),
		updatePoolContributions: mergeById({
			base: base?.updatePoolContributions,
			incoming: incoming?.updatePoolContributions,
		}),
		deletePoolContributions: mergeById({
			base: base?.deletePoolContributions,
			incoming: incoming?.deletePoolContributions,
		}),
		...(base?.deletePoolBalances || incoming?.deletePoolBalances
			? {
					deletePoolBalances: mergeById({
						base: base?.deletePoolBalances,
						incoming: incoming?.deletePoolBalances,
					}),
				}
			: {}),
	};
};

/** Two updates to the same pool sum their deltas instead of overwriting. */
const mergePooledBalanceUpdates = ({
	base,
	incoming,
}: {
	base?: PooledBalanceUpdate[];
	incoming?: PooledBalanceUpdate[];
}): PooledBalanceUpdate[] => {
	const updatesByPoolId = new Map<string, PooledBalanceUpdate>();

	for (const update of [...(base ?? []), ...(incoming ?? [])]) {
		const poolId = update.pooledCustomerEntitlement.id;
		const existing = updatesByPoolId.get(poolId);
		updatesByPoolId.set(
			poolId,
			existing
				? {
						pooledCustomerEntitlement: update.pooledCustomerEntitlement,
						balanceDelta: addSafe({
							left: existing.balanceDelta,
							right: update.balanceDelta,
						}),
						grantedDelta: addSafe({
							left: existing.grantedDelta,
							right: update.grantedDelta,
						}),
					}
				: update,
		);
	}

	return Array.from(updatesByPoolId.values());
};
