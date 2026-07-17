import type {
	CusProductStatus,
	FullCustomerEntitlement,
	FullSubject,
	SubjectBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { computePooledBalanceRebalance } from "./computePooledBalanceRebalance.js";
import {
	coalescePooledBalanceCacheEffects,
	type PooledBalanceCacheEffect,
} from "./pooledBalanceCacheEffects.js";

export const computePooledBalanceCacheCutover = ({
	fullSubject,
	featureIds,
	rawEffects,
	liveBalances,
	reverseOrder,
	inStatuses,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
	rawEffects: PooledBalanceCacheEffect[];
	liveBalances: SubjectBalance[];
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}): PooledBalanceCacheEffect[] => {
	const liveBalanceById = new Map(
		liveBalances.map((balance) => [balance.id, balance]),
	);
	const coalescedRawEffects = coalescePooledBalanceCacheEffects({
		effects: rawEffects,
	});
	const rawEffectById = new Map(
		coalescedRawEffects.map((effect) => [effect.customerEntitlementId, effect]),
	);
	const liveFullSubject = structuredClone(fullSubject);
	const customerEntitlements: FullCustomerEntitlement[] = [
		...liveFullSubject.extra_customer_entitlements,
		...liveFullSubject.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
	];

	for (const customerEntitlement of customerEntitlements) {
		const liveBalance = liveBalanceById.get(customerEntitlement.id);
		if (!liveBalance) continue;

		const rawEffect = rawEffectById.get(customerEntitlement.id);
		customerEntitlement.balance = new Decimal(liveBalance.balance)
			.plus(rawEffect?.balanceDelta ?? 0)
			.toNumber();
		customerEntitlement.adjustment = new Decimal(liveBalance.adjustment ?? 0)
			.plus(rawEffect?.adjustmentDelta ?? 0)
			.toNumber();
		customerEntitlement.additional_balance = liveBalance.additional_balance;
		customerEntitlement.entities = structuredClone(liveBalance.entities);
		customerEntitlement.rollovers = structuredClone(liveBalance.rollovers);
		customerEntitlement.replaceables = structuredClone(
			liveBalance.replaceables,
		);
	}

	const rebalanceEffects = computePooledBalanceRebalance({
		fullSubject: liveFullSubject,
		featureIds,
		reverseOrder,
		inStatuses,
	}).map(({ featureId, customerEntitlementId, delta }) => ({
		featureId,
		customerEntitlementId,
		balanceDelta: delta,
		adjustmentDelta: 0,
	}));

	return coalescePooledBalanceCacheEffects({
		effects: [...coalescedRawEffects, ...rebalanceEffects],
	}).map((effect) => ({
		...effect,
		expectedBalance: liveBalanceById.get(effect.customerEntitlementId)?.balance,
		expectedAdjustment: liveBalanceById.get(effect.customerEntitlementId)
			?.adjustment,
	}));
};
