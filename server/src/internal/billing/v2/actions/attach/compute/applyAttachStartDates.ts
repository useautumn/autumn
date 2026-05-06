import {
	type AttachBillingContext,
	EntInterval,
	type FullCusProduct,
	getCycleEnd,
} from "@autumn/shared";
import type { AttachStartTiming } from "./getAttachStartTiming";

export const applyAttachStartDates = ({
	newFullCustomerProduct,
	attachBillingContext,
	attachStartTiming,
}: {
	newFullCustomerProduct: FullCusProduct;
	attachBillingContext: AttachBillingContext;
	attachStartTiming: AttachStartTiming;
}): void => {
	const { billingStartsAt, currentEpochMs } = attachBillingContext;
	const { accessStartsAt, billingAnchorStartsAt } = attachStartTiming;

	if (billingStartsAt !== undefined) {
		for (const customerEntitlement of newFullCustomerProduct.customer_entitlements) {
			if (customerEntitlement.next_reset_at === null) continue;
			customerEntitlement.next_reset_at = getCycleEnd({
				anchor: billingStartsAt,
				interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
				intervalCount: customerEntitlement.entitlement.interval_count,
				now: billingStartsAt,
			});
		}
	}
	if (accessStartsAt === billingAnchorStartsAt) return;
	newFullCustomerProduct.starts_at = accessStartsAt ?? currentEpochMs;
};
