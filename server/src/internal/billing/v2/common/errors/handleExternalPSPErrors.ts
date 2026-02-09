import {
	cusProductToProcessorType,
	type FullCusProduct,
	ProcessorType,
	RecaseError,
} from "@autumn/shared";

/**
 * Validates that we're not trying to modify a customer product managed by an external PSP like RevenueCat.
 */
export const handleExternalPSPErrors = ({
	customerProduct,
	action,
}: {
	customerProduct?: FullCusProduct;
	action: "attach" | "update";
}) => {
	if (!customerProduct) return;

	const processorType = cusProductToProcessorType(customerProduct);
	if (processorType === ProcessorType.RevenueCat) {
		const message =
			action === "attach"
				? `Cannot attach because the customer's current product '${customerProduct.product.name}' is managed by RevenueCat.`
				: `Cannot update '${customerProduct.product.name}' because it is managed by RevenueCat.`;

		throw new RecaseError({
			message,
		});
	}
};
