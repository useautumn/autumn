import type { FullCusProduct } from "@models/cusProductModels/cusProductModels";
import { ProcessorType } from "@models/genModels/genEnums";

export const filterCustomerProductsByProcessorType = ({
	customerProducts,
	processorType,
}: {
	customerProducts: FullCusProduct[];
	processorType: ProcessorType;
}): FullCusProduct[] => {
	return customerProducts.filter((customerProduct) => {
		const cusProductProcessorType =
			customerProduct.processor?.type ?? ProcessorType.Stripe;
		return cusProductProcessorType === processorType;
	});
};
