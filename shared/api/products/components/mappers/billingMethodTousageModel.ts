import { BillingMethod } from "@api/products/components/billingMethod";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels";

/** Convert billing_method (V1) to usage_model (V0) */
export function billingMethodToUsageModel(
	billingMethod: BillingMethod,
): UsageModel {
	return billingMethod === BillingMethod.Prepaid
		? UsageModel.Prepaid
		: UsageModel.PayPerUse;
}
