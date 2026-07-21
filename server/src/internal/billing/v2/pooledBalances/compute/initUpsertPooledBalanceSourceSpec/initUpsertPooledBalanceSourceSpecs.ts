import {
	type FullCusProduct,
	isLifetimeEntitlement,
	type UpsertPooledBalanceSourceSpec,
} from "@autumn/shared";
import { customerEntitlementToPooledIdentity } from "@/internal/billing/v2/pooledBalances/utils/customerEntitlementToPooledIdentity/customerEntitlementToPooledIdentity.js";
import type { PooledResetPolicy } from "@/internal/billing/v2/pooledBalances/utils/pooledResetPolicy.js";
import { customerProductToPooledCustomerEntitlements } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct";
import { computePooledUsageCarrySpec } from "./computePooledUsageCarrySpec.js";
import { initPooledContributionSpec } from "./initPooledContributionSpec.js";
import { resolvePoolResetSchedule } from "./resolvePoolResetSchedule.js";

// The pool owns balances from here on; source cusEnts keep only reset metadata.
const zeroPooledSourceCustomerEntitlements = ({
	customerProduct,
	upsertSourceSpecs,
}: {
	customerProduct: FullCusProduct;
	upsertSourceSpecs: UpsertPooledBalanceSourceSpec[];
}): FullCusProduct => {
	const specByEntitlementId = new Map(
		upsertSourceSpecs.map((spec) => [
			spec.contribution.sourceEntitlementId,
			spec,
		]),
	);

	return {
		...customerProduct,
		customer_entitlements: customerProduct.customer_entitlements.map(
			(customerEntitlement) => {
				const spec = specByEntitlementId.get(
					customerEntitlement.entitlement.id,
				);
				if (!spec) return customerEntitlement;

				return {
					...customerEntitlement,
					balance: 0,
					adjustment: 0,
					additional_balance: 0,
					entities: null,
					reset_cycle_anchor: spec.pooledBalance.resetCycleAnchor,
					next_reset_at: spec.pooledBalance.nextResetAt,
				};
			},
		),
	};
};

export const initUpsertPooledBalanceSourceSpecs = ({
	customerProduct,
	resetPolicy,
	outgoingCustomerProduct,
}: {
	customerProduct: FullCusProduct;
	resetPolicy: PooledResetPolicy;
	outgoingCustomerProduct?: FullCusProduct;
}): {
	customerProduct: FullCusProduct;
	upsertSourceSpecs: UpsertPooledBalanceSourceSpec[];
} => {
	const pooledCustomerEntitlements =
		customerProductToPooledCustomerEntitlements({
			customerProduct,
		});

	const upsertSourceSpecs = pooledCustomerEntitlements.map(
		(customerEntitlement): UpsertPooledBalanceSourceSpec => {
			const usageCarry = computePooledUsageCarrySpec({
				customerEntitlement,
				outgoingCustomerProduct,
			});

			// Row-derived identity; non-lifetime pools take their schedule from
			// the attach policy instead of the row.
			const rowIdentity = customerEntitlementToPooledIdentity({
				customerEntitlement,
			});
			const pooledBalance = isLifetimeEntitlement({
				entitlement: customerEntitlement.entitlement,
			})
				? rowIdentity
				: {
						...rowIdentity,
						...resolvePoolResetSchedule({
							resetPolicy,
							customerEntitlement,
							interval: rowIdentity.interval,
							intervalCount: rowIdentity.intervalCount,
						}),
					};

			return {
				internalCustomerId: customerProduct.internal_customer_id,
				pooledBalance,
				contribution: initPooledContributionSpec({
					customerProduct,
					customerEntitlement,
					resetPolicy,
				}),
				...(usageCarry ? { usageCarry } : {}),
			};
		},
	);

	return {
		customerProduct: zeroPooledSourceCustomerEntitlements({
			customerProduct,
			upsertSourceSpecs,
		}),
		upsertSourceSpecs,
	};
};
