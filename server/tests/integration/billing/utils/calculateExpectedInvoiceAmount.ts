/**
 * Utility for calculating expected invoice amounts in tests.
 *
 * Uses ProductItem[] directly (no DB/Stripe calls needed) and the shared
 * billing utilities from @autumn/shared.
 */

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
	applyTo?: "fixed" | "all"; // 'usage' not supported - consumable items are never prorated
};

type CalculateOptions = {
	includeFixed?: boolean; // Include fixed/base prices (default: true)
	includeUsage?: boolean; // Include usage-based prices (default: true)
	onlyArrear?: boolean; // Only include consumable/arrear items (default: false)
};

/**
 * Checks if a product item is a fixed price (no feature, just a flat amount).
 */
const isFixedPriceItem = (item: ProductItem): boolean => {
	return !item.feature_id && item.price != null;
};

/**
 * Checks if a product item is a consumable/arrear item (pay-per-use).
 */
const isConsumableItem = (item: ProductItem): boolean => {
	return item.usage_model === UsageModel.PayPerUse;
};

/**
 * Checks if a product item is a prepaid item.
 */
const isPrepaidItem = (item: ProductItem): boolean => {
	return item.usage_model === UsageModel.Prepaid;
};

/**
 * Checks if a product item has usage-based pricing.
 */
const isUsageBasedItem = (item: ProductItem): boolean => {
	return isConsumableItem(item) || isPrepaidItem(item);
};

/**
 * Calculate the amount for a single product item.
 */
const calculateItemAmount = ({
	item,
	usage,
}: {
	item: ProductItem;
	usage?: UsageEntry;
}): number => {
	// Fixed price item - just return the price
	if (isFixedPriceItem(item)) {
		return item.price ?? 0;
	}

	// Usage-based item - need usage value
	if (!usage) return 0;

	const includedUsage =
		item.included_usage === Infinite ? Infinity : (item.included_usage ?? 0);
	const totalUsage = usage.value;

	// For consumable items: calculate overage (usage beyond included)
	if (isConsumableItem(item)) {
		const overage = Math.max(0, totalUsage - includedUsage);
		if (overage === 0) return 0;

		return calculateTieredAmount({ item, quantity: overage });
	}

	// For prepaid items: calculate based on quantity purchased
	if (isPrepaidItem(item)) {
		// For prepaid, the usage value represents units to purchase
		return calculateTieredAmount({ item, quantity: totalUsage });
	}

	return 0;
};

/**
 * Calculate amount using tiered pricing.
 */
const calculateTieredAmount = ({
	item,
	quantity,
}: {
	item: ProductItem;
	quantity: number;
}): number => {
	const tiers = item.tiers ?? [{ to: Infinite, amount: item.price ?? 0 }];
	const billingUnits = item.billing_units ?? 1;

	// Create a mock price object for tiersToLineAmount
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

/**
 * Calculate expected invoice amount from product items.
 *
 * @param items - The product items array (from product definition)
 * @param usage - Array of { featureId, value } for usage-based items
 * @param proration - Optional proration config for mid-cycle changes
 * @param options - Filter options (includeFixed, includeUsage, onlyArrear)
 *
 * @example
 * // Full invoice (base + overage)
 * const total = calculateExpectedInvoiceAmount({
 *   items: pro.items,
 *   usage: [{ featureId: TestFeature.Messages, value: 500 }],
 * });
 *
 * @example
 * // Only overage (for final invoice check)
 * const overage = calculateExpectedInvoiceAmount({
 *   items: pro.items,
 *   usage: [{ featureId: TestFeature.Messages, value: 500 }],
 *   options: { includeFixed: false, onlyArrear: true },
 * });
 *
 * @example
 * // Prorated base price for mid-cycle upgrade
 * const proratedCharge = calculateExpectedInvoiceAmount({
 *   items: pro.items,
 *   proration: {
 *     billingPeriod: { start: cycleStart, end: cycleEnd },
 *     now: upgradeTime,
 *     applyTo: 'fixed',
 *   },
 *   options: { includeUsage: false },
 * });
 */
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

		// Apply filters
		if (isFixed && !includeFixed) continue;
		if (isUsage && !includeUsage) continue;
		if (onlyArrear && !isArrear) continue;

		// Find matching usage for this item
		const itemUsage = item.feature_id
			? usage.find((u) => u.featureId === item.feature_id)
			: undefined;

		// Calculate base amount for this item
		let amount = calculateItemAmount({ item, usage: itemUsage });

		// Apply proration if configured (never for consumable items)
		if (proration && amount > 0 && !isArrear) {
			const shouldProrate =
				proration.applyTo === "all" ||
				(proration.applyTo === "fixed" && isFixed) ||
				(!proration.applyTo && isFixed); // Default: only prorate fixed

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
