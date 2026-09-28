import {
	type BillingContext,
	type Price,
	priceToProrationConfig,
} from "@autumn/shared";
import { billingContextBillsDifference } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

/** `bill_difference` overrides a price's on_increase / on_decrease so the charge
 * or credit and the quantity change both apply now. */
export const billingContextToQuantityProrationConfig = ({
	billingContext,
	price,
	isUpgrade,
}: {
	billingContext: BillingContext;
	price: Price;
	isUpgrade: boolean;
}) => {
	if (billingContextBillsDifference({ billingContext })) {
		return {
			shouldApplyProration: true,
			chargeImmediately: true,
			skipLineItems: false,
		};
	}
	return priceToProrationConfig({ price, isUpgrade });
};
