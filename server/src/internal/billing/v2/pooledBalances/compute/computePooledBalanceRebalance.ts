import {
	type CusProductStatus,
	cusEntsToUsage,
	cusEntToRecalculateScopeKey,
	type FullCusEntWithFullCusProduct,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	isBooleanCusEnt,
	isEntityScopedCusEnt,
	isUnlimitedCusEnt,
	RECALCULATE_CUSTOMER_SCOPE,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	getCustomerEntitlementGrantState,
	reapplyUsageToCustomerEntitlements,
} from "@/internal/balances/recalculateBalance/reapplyUsageToCustomerEntitlements.js";
import { isPooledSourceCustomerEntitlement } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

export type PooledBalanceRebalanceDelta = {
	customerEntitlementId: string;
	featureId: string;
	delta: number;
};

export type PooledBalanceUsageReapply = {
	featureId: string;
	amount: number;
	excludedSourceCustomerProductId: string;
};

const isCustomerLevelNumericBalance = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): boolean => {
	// An entity-attached pooled row is only the normalized source record. Its
	// grant lives on the synthetic customer-level pool entitlement, so putting
	// the catalog allowance back here would double-mint the contribution.
	if (
		isPooledSourceCustomerEntitlement({
			customerEntitlement,
			customerProduct: customerEntitlement.customer_product,
		})
	) {
		return false;
	}
	if (
		cusEntToRecalculateScopeKey({ cusEnt: customerEntitlement }) !==
		RECALCULATE_CUSTOMER_SCOPE
	) {
		return false;
	}
	if (isBooleanCusEnt({ cusEnt: customerEntitlement })) return false;
	if (isUnlimitedCusEnt(customerEntitlement)) return false;
	if (isEntityScopedCusEnt(customerEntitlement)) return false;
	return true;
};

export const getPooledRebalanceCustomerEntitlements = ({
	fullSubject,
	featureId,
	reverseOrder = false,
	inStatuses,
}: {
	fullSubject: FullSubject;
	featureId: string;
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}) =>
	fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
		reverseOrder,
		inStatuses,
	}).filter(isCustomerLevelNumericBalance);

const hasBalanceToRedistribute = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): boolean => {
	let hasNegativeBalance = false;
	let hasPositiveBalance = false;
	for (const customerEntitlement of customerEntitlements) {
		const balance = customerEntitlement.balance ?? 0;
		if (balance < 0) hasNegativeBalance = true;
		if (balance > 0) hasPositiveBalance = true;
	}
	return hasNegativeBalance && hasPositiveBalance;
};

const computeReappliedUsageDeltas = ({
	featureId,
	currentCustomerEntitlements,
	usage,
}: {
	featureId: string;
	currentCustomerEntitlements: FullCusEntWithFullCusProduct[];
	usage: number;
}): PooledBalanceRebalanceDelta[] => {
	const rebalancedCustomerEntitlements = currentCustomerEntitlements.map(
		(customerEntitlement) => structuredClone(customerEntitlement),
	);
	reapplyUsageToCustomerEntitlements({
		customerEntitlements: rebalancedCustomerEntitlements,
		usage,
		getGrantState: getCustomerEntitlementGrantState,
	});

	const rebalancedById = new Map(
		rebalancedCustomerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	const deltas: PooledBalanceRebalanceDelta[] = [];
	for (const customerEntitlement of currentCustomerEntitlements) {
		const rebalanced = rebalancedById.get(customerEntitlement.id);
		if (!rebalanced) continue;

		const delta = new Decimal(rebalanced.balance ?? 0)
			.minus(customerEntitlement.balance ?? 0)
			.toNumber();
		if (delta === 0) continue;

		deltas.push({
			customerEntitlementId: customerEntitlement.id,
			featureId,
			delta,
		});
	}
	return deltas;
};

export const computePooledBalanceUsageReapply = ({
	fullSubject,
	usageReapplies,
	reverseOrder = false,
	inStatuses,
}: {
	fullSubject: FullSubject;
	usageReapplies: PooledBalanceUsageReapply[];
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}): PooledBalanceRebalanceDelta[] => {
	const byFeatureId = new Map<
		string,
		{
			amount: Decimal;
			excludedSourceCustomerProductIds: Set<string>;
		}
	>();
	for (const usageReapply of usageReapplies) {
		if (usageReapply.amount <= 0) continue;
		const current = byFeatureId.get(usageReapply.featureId) ?? {
			amount: new Decimal(0),
			excludedSourceCustomerProductIds: new Set<string>(),
		};
		current.amount = current.amount.plus(usageReapply.amount);
		current.excludedSourceCustomerProductIds.add(
			usageReapply.excludedSourceCustomerProductId,
		);
		byFeatureId.set(usageReapply.featureId, current);
	}

	const deltas: PooledBalanceRebalanceDelta[] = [];
	for (const [featureId, reapply] of byFeatureId) {
		const customerEntitlements = getPooledRebalanceCustomerEntitlements({
			fullSubject,
			featureId,
			reverseOrder,
			inStatuses,
		}).filter(
			(customerEntitlement) =>
				!customerEntitlement.customer_product ||
				!reapply.excludedSourceCustomerProductIds.has(
					customerEntitlement.customer_product.id,
				),
		);
		if (customerEntitlements.length === 0) continue;

		const usage = reapply.amount
			.plus(cusEntsToUsage({ cusEnts: customerEntitlements }))
			.toNumber();
		deltas.push(
			...computeReappliedUsageDeltas({
				featureId,
				currentCustomerEntitlements: customerEntitlements,
				usage,
			}),
		);
	}
	return deltas;
};

/** Reapplies recorded usage after a pooled grant changes, using Autumn's
 * global entitlement ordering and returning balance-only deltas. */
export const computePooledBalanceRebalance = ({
	fullSubject,
	featureIds,
	reverseOrder = false,
	inStatuses,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}): PooledBalanceRebalanceDelta[] => {
	const deltas: PooledBalanceRebalanceDelta[] = [];

	for (const featureId of new Set(featureIds)) {
		const customerEntitlements = getPooledRebalanceCustomerEntitlements({
			fullSubject,
			featureId,
			reverseOrder,
			inStatuses,
		});

		if (
			customerEntitlements.length < 2 ||
			!hasBalanceToRedistribute({ customerEntitlements })
		) {
			continue;
		}

		deltas.push(
			...computeReappliedUsageDeltas({
				featureId,
				currentCustomerEntitlements: customerEntitlements,
				usage: cusEntsToUsage({ cusEnts: customerEntitlements }),
			}),
		);
	}

	return deltas;
};
