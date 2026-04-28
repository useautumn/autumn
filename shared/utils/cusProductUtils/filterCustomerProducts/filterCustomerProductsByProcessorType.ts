import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { ProcessorType } from "@models/genModels/genEnums";
import { cusProductToProcessorType } from "../convertCusProduct.js";

/**
 * Filter customer products by processor type.
 *
 * `cusProductToProcessorType` treats an unset `processor` as Stripe (default),
 * so passing `ProcessorType.Stripe` keeps both legacy unset rows and explicit
 * Stripe-tagged rows.
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
	return customerProducts.filter(
		(customerProduct) =>
			cusProductToProcessorType(customerProduct) === processorType,
	);
};
