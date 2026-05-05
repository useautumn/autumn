import { EntInterval, type FullCusProduct, getCycleEnd } from "@autumn/shared";

export const applyAttachStartDates = ({
	newFullCustomerProduct,
	billingStartsAt,
	accessStartsAt,
	billingAnchorStartsAt,
	currentEpochMs,
}: {
	newFullCustomerProduct: FullCusProduct;
	billingStartsAt?: number;
	accessStartsAt?: number;
	billingAnchorStartsAt?: number;
	currentEpochMs: number;
}): void => {
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
