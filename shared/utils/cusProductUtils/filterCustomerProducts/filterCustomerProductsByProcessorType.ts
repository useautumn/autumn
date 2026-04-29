import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { ProcessorType } from "@models/genModels/genEnums";

/**
 * Filter customer products by processor type.
 *
 * IMPORTANT: a customer product with no `processor` set (or `processor.type` unset)
 * is treated as Stripe. Historically, Stripe-managed cus products were created
 * without explicitly tagging the processor field, so a null/undefined processor
 * defaults to Stripe. RevenueCat-managed products always have
 * `processor.type === ProcessorType.RevenueCat` explicitly set.
 *
 * @param customerProducts - The customer products to filter
 * @param processorType - The processor type to keep (e.g. `ProcessorType.Stripe`)
 * @returns Customer products whose resolved processor type matches
 */
export const filterCustomerProductsByProcessorType = ({
	customerProducts,
	processorType,
}: {
	customerProducts: FullCusProduct[];
	processorType: ProcessorType;
}): FullCusProduct[] => {
	return customerProducts.filter((customerProduct) => {
		// Default unset processor to Stripe — RevenueCat is always explicitly tagged.
		const cusProductProcessorType =
			customerProduct.processor?.type ?? ProcessorType.Stripe;
		return cusProductProcessorType === processorType;
	});
};
