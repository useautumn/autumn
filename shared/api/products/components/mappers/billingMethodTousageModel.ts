import { BillingMethod } from "@api/products/components/billingMethod";
import { UsageModel } from "@models/productV2Models/productItemModels/productItemModels";

export function billingMethodToUsageModel(
	billingMethod: BillingMethod,
): UsageModel {
	return billingMethod === BillingMethod.Prepaid
		? UsageModel.Prepaid
		: UsageModel.PayPerUse;
}
