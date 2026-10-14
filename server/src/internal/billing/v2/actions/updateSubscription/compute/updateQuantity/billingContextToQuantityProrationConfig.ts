import {
	type BillingContext,
	type Price,
	priceToProrationConfig,
} from "@autumn/shared";
import { billingContextBillsDifference } from "@/internal/billing/v2/utils/billingContext/billingContextToProrationNow";

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
