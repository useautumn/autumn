import {
	CusProductStatus,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type { ResetVerdict } from "../types.js";

/** Classifies candidates that should not be mutated by this worker. */
export const classifyNoAction = ({
	customerEntitlement,
}: {
	customerEntitlement: ResetContextCustomerEntitlement;
}): ResetVerdict | null => {
	// Not overdue (or no reset schedule at all): the scanner re-enqueues
	// across sweeps and SQS is at-least-once, so redelivered rows that were
	// already reset MUST be a no-op — otherwise a redelivery would re-top the
	// balance and push next_reset_at another cycle forward.
	if (
		customerEntitlement.next_reset_at == null ||
		customerEntitlement.next_reset_at >= Date.now()
	) {
		return {
			kind: "no_action",
			customerEntitlementId: customerEntitlement.id,
			reason: "not_due",
		};
	}

	if (
		isPooledBalanceSourceCustomerEntitlement({ customerEntitlement })
	) {
		return {
			kind: "no_action",
			customerEntitlementId: customerEntitlement.id,
			reason: "pooled_balance_source",
		};
	}

	if (
		isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement })
	) {
		if (!customerEntitlement.pooled_balance) {
			return {
				kind: "no_action",
				customerEntitlementId: customerEntitlement.id,
				reason: "pooled_balance_missing",
			};
		}

		if (
			customerEntitlement.pooled_balance.reset_mode ===
			PooledBalanceResetMode.Subscription
		) {
			return {
				kind: "resets_via_invoice",
				customerEntitlementId: customerEntitlement.id,
			};
		}
	}

	const customerProduct = customerEntitlement.customer_product;
	if (!customerProduct) return null;

	if (
		customerProduct.status === CusProductStatus.PastDue &&
		!customerProduct.product.config?.ignore_past_due
	) {
		return {
			kind: "no_action",
			customerEntitlementId: customerEntitlement.id,
			reason: "product_past_due",
		};
	}

	// Parity with the lazy path (and the V1 cron): only Active and gated
	// PastDue products reset. Scheduled/Trialing/Paused/etc. must not have
	// their balances topped up or next_reset_at advanced. (Expired products
	// are handled earlier by classifyShouldExpire.)
	if (
		customerProduct.status !== CusProductStatus.Active &&
		customerProduct.status !== CusProductStatus.PastDue
	) {
		return {
			kind: "no_action",
			customerEntitlementId: customerEntitlement.id,
			reason: "product_not_active",
		};
	}

	return null;
};
