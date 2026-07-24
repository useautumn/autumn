import {
	cusEntToCusPrice,
	isCustomerEntitlementPrepaidWithSeparateResetInterval,
	isLifetimeEntitlement,
	isUnlimitedEntitlement,
} from "@autumn/shared";
import type { ResetContextCustomerEntitlement } from "@/internal/customers/cusProducts/cusEnts/repos/getResetContextByIds.js";
import type { ResetVerdict } from "../types.js";
import { classifyNoAction } from "./classifyNoAction.js";
import { classifyShouldExpire } from "./classifyShouldExpire.js";

export const classifyResetCandidate = ({
	customerEntitlement,
}: {
	customerEntitlement: ResetContextCustomerEntitlement;
}): ResetVerdict | null => {
	const customerEntitlementId = customerEntitlement.id;
	const entitlement = customerEntitlement.entitlement;

	const shouldExpire = classifyShouldExpire({ customerEntitlement });
	if (shouldExpire) return shouldExpire;

	const noAction = classifyNoAction({ customerEntitlement });
	if (noAction) return noAction;

	if (isUnlimitedEntitlement({ entitlement })) {
		return { kind: "clear_next_reset", customerEntitlementId, unlimited: true };
	}

	if (isLifetimeEntitlement({ entitlement })) {
		return {
			kind: "clear_next_reset",
			customerEntitlementId,
			unlimited: false,
		};
	}

	const customerProduct = customerEntitlement.customer_product;
	if (!customerProduct) return null;

	// Price-backed entitlements on a live subscription reset from
	// invoice.created, not here — except split prepaid reset intervals.
	// Without a subscription there is no invoice, so the reset stays ours.
	const customerPrice = cusEntToCusPrice({ cusEnt: customerEntitlement });
	const hasSubscription = (customerProduct.subscription_ids?.length ?? 0) > 0;
	if (
		customerPrice &&
		hasSubscription &&
		!isCustomerEntitlementPrepaidWithSeparateResetInterval({
			customerEntitlement,
			customerPrice,
		})
	) {
		return { kind: "resets_via_invoice", customerEntitlementId };
	}

	return null;
};
