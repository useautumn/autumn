import {
	type CusProductStatus,
	cusEntsToUsage,
	type FullSubject,
	type SubjectBalance,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import {
	getCustomerEntitlementGrantState,
	reapplyUsageToCustomerEntitlements,
} from "@/internal/balances/recalculateBalance/reapplyUsageToCustomerEntitlements.js";
import { getPooledRebalanceCustomerEntitlements } from "./computePooledBalanceRebalance.js";

export type PooledBalanceReconciliationUpdate = {
	customerEntitlementId: string;
	featureId: string;
	balance: number;
	adjustment: number;
};

/** Rebuilds affected balance distributions after live cache state has first
 * been flushed to Postgres. Contribution totals supply synthetic pool grants;
 * Autumn's normal deduction kernel reapplies the recorded usage. */
export const computePooledBalanceReconciliation = ({
	fullSubject,
	featureIds,
	pooledGrantByCustomerEntitlementId,
	liveBalances = [],
	reverseOrder = false,
	inStatuses,
}: {
	fullSubject: FullSubject;
	featureIds: string[];
	pooledGrantByCustomerEntitlementId: ReadonlyMap<string, number>;
	liveBalances?: SubjectBalance[];
	reverseOrder?: boolean;
	inStatuses?: CusProductStatus[];
}): PooledBalanceReconciliationUpdate[] => {
	const updates: PooledBalanceReconciliationUpdate[] = [];
	const liveFullSubject = structuredClone(fullSubject);
	const liveBalanceById = new Map(
		liveBalances.map((liveBalance) => [liveBalance.id, liveBalance]),
	);
	for (const customerEntitlement of [
		...liveFullSubject.extra_customer_entitlements,
		...liveFullSubject.customer_products.flatMap(
			(customerProduct) => customerProduct.customer_entitlements,
		),
	]) {
		const liveBalance = liveBalanceById.get(customerEntitlement.id);
		if (!liveBalance) continue;
		customerEntitlement.balance = liveBalance.balance;
		customerEntitlement.adjustment = liveBalance.adjustment;
		customerEntitlement.additional_balance = liveBalance.additional_balance;
		customerEntitlement.entities = structuredClone(liveBalance.entities);
		customerEntitlement.rollovers = structuredClone(liveBalance.rollovers);
		customerEntitlement.replaceables = structuredClone(
			liveBalance.replaceables,
		);
	}

	for (const featureId of new Set(featureIds)) {
		const before = getPooledRebalanceCustomerEntitlements({
			fullSubject: liveFullSubject,
			featureId,
			reverseOrder,
			inStatuses,
		});
		if (before.length === 0) continue;

		const usage = cusEntsToUsage({ cusEnts: before });
		const after = before.map((customerEntitlement) => {
			const clone = structuredClone(customerEntitlement);
			const pooledGrant = pooledGrantByCustomerEntitlementId.get(clone.id);
			if (pooledGrant !== undefined) clone.adjustment = pooledGrant;
			return clone;
		});
		reapplyUsageToCustomerEntitlements({
			customerEntitlements: after,
			usage,
			getGrantState: getCustomerEntitlementGrantState,
		});

		for (const customerEntitlement of after) {
			const original = before.find(
				(candidate) => candidate.id === customerEntitlement.id,
			);
			if (!original) continue;
			const balance = customerEntitlement.balance ?? 0;
			const adjustment = customerEntitlement.adjustment ?? 0;
			if (
				new Decimal(balance).equals(original.balance ?? 0) &&
				new Decimal(adjustment).equals(original.adjustment ?? 0)
			) {
				continue;
			}

			updates.push({
				customerEntitlementId: customerEntitlement.id,
				featureId,
				balance,
				adjustment,
			});
		}
	}

	return updates;
};
