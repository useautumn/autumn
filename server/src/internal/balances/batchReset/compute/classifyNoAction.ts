import {
	CusProductStatus,
	isPooledBalanceSourceCustomerEntitlement,
	isSyntheticPooledBalanceCustomerEntitlement,
	PooledBalanceResetMode,
} from "@autumn/shared";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type { ResetVerdict } from "../types.js";

export const classifyNoAction = ({
	customerEntitlement,
}: {
	customerEntitlement: ResetContextCustomerEntitlement;
}): ResetVerdict | null => {
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

	if (isPooledBalanceSourceCustomerEntitlement({ customerEntitlement })) {
		return {
			kind: "no_action",
			customerEntitlementId: customerEntitlement.id,
			reason: "pooled_balance_source",
		};
	}

	if (isSyntheticPooledBalanceCustomerEntitlement({ customerEntitlement })) {
		if (!customerEntitlement.pooled_balance) {
			return {
				kind: "no_action",
				customerEntitlementId: customerEntitlement.id,
				reason: "pooled_balance_missing",
			};
		}

		if (
			customerEntitlement.pooled_balance.reset_mode ===
			PooledBalanceResetMode.Lifetime
		) {
			return {
				kind: "no_action",
				customerEntitlementId: customerEntitlement.id,
				reason: "pooled_balance_lifetime",
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
