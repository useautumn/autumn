import type {
	ProcessorItem,
	StripeCheckoutSessionAction,
} from "@autumn/shared";
import { itemParamsToProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

const isOneOffItem = (item: ProcessorItem) => item.price?.interval === null;

/** A subscription checkout creates the subscription with its recurring line items; one-offs are only invoiced. */
export const checkoutSessionActionToProcessorItems = ({
	checkoutSessionAction,
	context,
}: {
	checkoutSessionAction?: StripeCheckoutSessionAction;
	context: ProcessorItemContext;
}): ProcessorItem[] => {
	if (checkoutSessionAction?.params.mode !== "subscription") return [];

	return (checkoutSessionAction.params.line_items ?? [])
		.map((item) => itemParamsToProcessorItem({ item, context }))
		.filter((item) => !isOneOffItem(item));
};
