import type {
	ProcessorItem,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { toProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

/** A subscription checkout creates the subscription with exactly its line items. */
export const checkoutSessionActionToProcessorItems = ({
	checkoutSessionAction,
	context,
}: {
	checkoutSessionAction?: StripeCheckoutSessionAction;
	context: ProcessorItemContext;
}): ProcessorItem[] => {
	if (checkoutSessionAction?.params.mode !== "subscription") return [];

	return (checkoutSessionAction.params.line_items ?? []).map((lineItem) =>
		toProcessorItem({
			stripePriceId: lineItem.price,
			inlinePriceData: lineItem.price_data,
			quantity: lineItem.quantity,
			context,
		}),
	);
};
