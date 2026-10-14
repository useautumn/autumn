import {
	applyProration,
	Infinite,
	type Price,
	type ProductItem,
	tiersToLineAmount,
	UsageModel,
} from "@autumn/shared";
import { Decimal } from "decimal.js";

type UsageEntry = {
	featureId: string;
	value: number;
};

type BillingPeriod = {
	start: number;
	end: number;
};

type ProrationConfig = {
	billingPeriod: BillingPeriod;
	now: number;
	applyTo?: "fixed" | "all";
};

type CalculateOptions = {
	includeFixed?: boolean;
	includeUsage?: boolean;
	onlyArrear?: boolean;
};

const isFixedPriceItem = (item: ProductItem): boolean => {
	return !item.feature_id && item.price != null;
};

const isConsumableItem = (item: ProductItem): boolean => {
	return item.usage_model === UsageModel.PayPerUse;
};

const isPrepaidItem = (item: ProductItem): boolean => {
	return item.usage_model === UsageModel.Prepaid;
};

const isUsageBasedItem = (item: ProductItem): boolean => {
	return isConsumableItem(item) || isPrepaidItem(item);
};

const calculateItemAmount = ({
	item,
	usage,
}: {
	item: ProductItem;
	usage?: UsageEntry;
}): number => {
	if (isFixedPriceItem(item)) {
		return item.price ?? 0;
	}

	if (!usage) return 0;

	const includedUsage =
		item.included_usage === Infinite ? Infinity : (item.included_usage ?? 0);
	const totalUsage = usage.value;

	if (isConsumableItem(item)) {
		const overage = Math.max(0, totalUsage - includedUsage);
		if (overage === 0) return 0;

		return calculateTieredAmount({ item, quantity: overage });
	}

	if (isPrepaidItem(item)) {
		return calculateTieredAmount({ item, quantity: totalUsage });
	}

	return 0;
};

const calculateTieredAmount = ({
	item,
	quantity,
}: {
	item: ProductItem;
	quantity: number;
}): number => {
	const tiers = item.tiers ?? [{ to: Infinite, amount: item.price ?? 0 }];
	const billingUnits = item.billing_units ?? 1;

	const mockPrice = {
		config: {
			usage_tiers: tiers,
			billing_units: billingUnits,
		},
	} as Price;

	return tiersToLineAmount({
		price: mockPrice,
		overage: quantity,
		billingUnits,
	});
};

export const calculateExpectedInvoiceAmount = ({
	items,
	usage = [],
	proration,
	options = {},
}: {
	items: ProductItem[];
	usage?: UsageEntry[];
	proration?: ProrationConfig;
	options?: CalculateOptions;
}): number => {
	const {
		includeFixed = true,
		includeUsage = true,
		onlyArrear = false,
	} = options;

	let total = new Decimal(0);

	for (const item of items) {
		const isFixed = isFixedPriceItem(item);
		const isUsage = isUsageBasedItem(item);
		const isArrear = isConsumableItem(item);

		if (isFixed && !includeFixed) continue;
		if (isUsage && !includeUsage) continue;
		if (onlyArrear && !isArrear) continue;

		const itemUsage = item.feature_id
			? usage.find((u) => u.featureId === item.feature_id)
			: undefined;

		let amount = calculateItemAmount({ item, usage: itemUsage });

		if (proration && amount > 0 && !isArrear) {
			const shouldProrate =
				proration.applyTo === "all" ||
				(proration.applyTo === "fixed" && isFixed) ||
				(!proration.applyTo && isFixed);

			if (shouldProrate) {
				amount = applyProration({
					now: proration.now,
					billingPeriod: proration.billingPeriod,
					amount,
				});
			}
		}

		total = total.plus(amount);
	}

	return total.toDecimalPlaces(2).toNumber();
};
