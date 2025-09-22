import { isArrearPrice } from "@/internal/products/prices/priceUtils/usagePriceUtils/classifyUsagePrice.js";
import { ItemSet } from "@/utils/models/ItemSet.js";
import Stripe from "stripe";

export const mergeNewSubItems = ({
	itemSet,
	curSubItems,
}: {
	itemSet: ItemSet;
	curSubItems: Stripe.SubscriptionItem[];
}) => {
	// 1. Don't need to add arrear prices if they already exist...
	let newSubItems = structuredClone(itemSet.subItems);
	const newArrearSubItems: any[] = [];

	newSubItems = newSubItems.filter((newSi) => {
		const existingItem = curSubItems.find((si) => si.price?.id === newSi.price);
		if (isArrearPrice({ price: newSi.autumnPrice }) && existingItem) {
			newArrearSubItems.push(newSi);
			return false;
		}
		return true;
	});

	// 2. Add new subItems
	for (let i = 0; i < newSubItems.length; i++) {
		const newItem = newSubItems[i];
		const existingItem = curSubItems.find(
			(si) => si.price?.id === newItem.price,
		);

		if (!existingItem) continue;

		newSubItems[i] = {
			id: existingItem.id,
			quantity: (existingItem.quantity || 0) + (newItem.quantity || 0),
			// price: newItem.price,
			// autumnPrice: newItem.autumnPrice,
		};
	}

	return newSubItems;
};

export const mergeNewScheduleItems = ({
	itemSet,
	curScheduleItems,
}: {
	itemSet: ItemSet;
	curScheduleItems: Stripe.SubscriptionSchedule.Phase.Item[];
}) => {
	const originalScheduleItems = structuredClone(curScheduleItems);
	let newScheduleItems: any[] = structuredClone(curScheduleItems).map((si) => ({
		price: (si.price as Stripe.Price).id,
		quantity: si.quantity,
	}));

	for (const newItem of itemSet.subItems) {
		const existingIndex = newScheduleItems.findIndex(
			(si) => si.price === newItem.price,
		);

		if (existingIndex !== -1) {
			newScheduleItems[existingIndex].quantity =
				(newScheduleItems[existingIndex].quantity || 0) +
				(newItem.quantity || 0);
		} else {
			newScheduleItems.push({
				price: newItem.price,
				quantity: newItem.quantity,
			});
		}
	}

	return newScheduleItems.map((si) => ({
		price: si.price,
		quantity: si.quantity,
		// scheduleItem: originalScheduleItems.find(
		//   (osi) => (osi.price as Stripe.Price)?.id === si.price
		// ),
	}));
};
