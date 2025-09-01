import type { ItemSet } from "@/utils/models/ItemSet.js";

export const mergeItemSets = ({
	curItemSet,
	newItemSet,
}: {
	curItemSet: ItemSet;
	newItemSet: ItemSet;
}) => {
	const curSetItems = curItemSet.subItems;
	for (const item of newItemSet.subItems) {
		const priceIndex = curSetItems.findIndex((i) => i.price === item.price);
		if (priceIndex !== -1) {
			curSetItems[priceIndex].quantity =
				(curSetItems[priceIndex].quantity || 0) + (item.quantity || 0);
		} else {
			curSetItems.push(item);
		}
	}
	const curInvoiceItems = curItemSet.invoiceItems;
	for (const item of newItemSet.invoiceItems) {
		const priceIndex = curInvoiceItems.findIndex((i) => i.price === item.price);
		if (priceIndex !== -1) {
			curInvoiceItems[priceIndex].quantity =
				(curInvoiceItems[priceIndex].quantity || 0) + (item.quantity || 0);
		} else {
			curInvoiceItems.push(item);
		}
	}
	const curUsageFeatures = curItemSet.usageFeatures;
	for (const feature of newItemSet.usageFeatures) {
		if (!curUsageFeatures.includes(feature)) {
			curUsageFeatures.push(feature);
		}
	}

	return {
		subItems: curSetItems,
		invoiceItems: curInvoiceItems,
		usageFeatures: curUsageFeatures,
	};
};
