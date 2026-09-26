import type {
	ProcessorItemChange,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { toProcessorItemChange } from "./toProcessorItemChange";
import type { AutumnStripePriceIndex } from "./types/autumnStripePriceIndex";

export const checkoutSessionActionToProcessorItemChanges = ({
	checkoutSessionAction,
	priceIndex,
}: {
	checkoutSessionAction?: StripeCheckoutSessionAction;
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange[] => {
	if (checkoutSessionAction?.params.mode !== "subscription") return [];

	return (checkoutSessionAction.params.line_items ?? []).map((lineItem) =>
		toProcessorItemChange({
			action: "created",
			stripePriceId: lineItem.price,
			inlinePrice: lineItem.price_data !== undefined,
			quantity: lineItem.quantity,
			priceIndex,
		}),
	);
};
