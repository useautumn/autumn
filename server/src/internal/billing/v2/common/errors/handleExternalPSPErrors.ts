import {
	type CancelAction,
	cusProductToProcessorType,
	type FullCusProduct,
	type FullProduct,
	isCustomerProductOneOff,
	isOneOffProduct,
	ProcessorType,
	RecaseError,
	UpdateSubscriptionIntent,
} from "@autumn/shared";

export const handleExternalPSPErrors = ({
	customerProduct,
	customerProducts,
	attachProduct,
	action,
	cancelAction,
	noBillingChanges,
	intent,
	hasFieldUpdates,
}: {
	customerProduct?: FullCusProduct;
	customerProducts?: FullCusProduct[];
	attachProduct?: FullProduct;
	action: "attach" | "update";
	cancelAction?: CancelAction;
	noBillingChanges?: boolean;
	intent?: UpdateSubscriptionIntent;
	hasFieldUpdates?: boolean;
}) => {
	if (action === "update") {
		if (!customerProduct) return;

		const isAutumnOnlyCancel =
			intent === UpdateSubscriptionIntent.CancelAction &&
			cancelAction !== undefined &&
			cancelAction !== "uncancel" &&
			noBillingChanges === true &&
			!hasFieldUpdates;
		if (isAutumnOnlyCancel) return;

		const processorType = cusProductToProcessorType(customerProduct);
		if (processorType === ProcessorType.RevenueCat) {
			throw new RecaseError({
				message: `Subscription for '${customerProduct.product.name}' is managed by RevenueCat and cannot be updated directly`,
				statusCode: 409,
			});
		}
		return;
	}

	if (!customerProducts || customerProducts.length === 0) return;

	if (attachProduct && isOneOffProduct({ product: attachProduct })) {
		return;
	}

	const conflictingExternalCusProduct = customerProducts.find((cp) => {
		const isExternal = cusProductToProcessorType(cp) !== ProcessorType.Stripe;
		if (!isExternal) return false;

		return !isCustomerProductOneOff(cp);
	});

	if (conflictingExternalCusProduct) {
		throw new RecaseError({
			message: `Cannot attach because the customer's current product '${conflictingExternalCusProduct.product.name}' is managed by RevenueCat.`,
			statusCode: 409,
		});
	}
};
