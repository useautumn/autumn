import type { Feature } from "@models/featureModels/featureModels";
import type { DbInvoiceLineItem } from "../../..";

export const invoiceLineItemToDisplay = ({
	invoiceLineItem,
	features,
}: {
	invoiceLineItem: DbInvoiceLineItem;
	features: Feature[];
}): string => {
	//  1. is base price
	const isBase = !invoiceLineItem.feature_id;

	if (isBase) {
		return `Base Price`;
	}

	const feature = features.find((f) => f.id === invoiceLineItem.feature_id);
	return feature?.name ?? "";
};
