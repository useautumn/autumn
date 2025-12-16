import {
	type FullCusProduct,
	filterCusProductsBySubId,
	isConsumablePrice,
	isCusProductOngoing,
	type StripeItemSpec,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv";
import type { AttachContext } from "../../../v2/types";
import { cusProductToStripeItemSpecs } from "../cusProductToStripeItemSpecs";

/**
 * Initialize targetItems with current sub state.
 * - Regular items: set quantity
 * - Metered items: set undefined (no quantity)
 */
const initializeTargetItems = ({
	currentItems,
}: {
	currentItems: Stripe.SubscriptionItem[];
}): Map<string, number | undefined> => {
	const targetItems = new Map<string, number | undefined>();

	for (const item of currentItems) {
		const priceId = item.price?.id;
		if (!priceId) continue;

		// Metered items have no quantity (or quantity is irrelevant)
		const isMetered = item.price?.recurring?.usage_type === "metered";
		targetItems.set(priceId, isMetered ? undefined : (item.quantity ?? 1));
	}

	return targetItems;
};

/**
 * Adds new items to targetItems map.
 * - Consumable prices: only add if not already in map, use spec.quantity (0 or undefined)
 * - Regular prices: add to existing quantity in map
 */
const addNewItems = ({
	targetItems,
	itemsToAdd,
}: {
	targetItems: Map<string, number | undefined>;
	itemsToAdd: StripeItemSpec[];
}) => {
	for (const spec of itemsToAdd) {
		const isConsumable =
			spec.autumnPrice && isConsumablePrice(spec.autumnPrice);

		// CONSUMABLE: Only add if not already in map, use quantity from spec
		if (isConsumable) {
			if (targetItems.has(spec.stripePriceId)) continue;
			targetItems.set(spec.stripePriceId, spec.quantity); // Could be 0 or undefined
			continue;
		}

		// REGULAR: Add to existing quantity in map
		const existingQty = targetItems.get(spec.stripePriceId) ?? 0;
		const newQty = (existingQty ?? 0) + (spec.quantity ?? 1);
		targetItems.set(spec.stripePriceId, newQty);
	}
};

/**
 * Check if a cusProduct has a specific stripe price ID
 */
const cusProductHasStripePriceId = ({
	cusProduct,
	stripePriceId,
}: {
	cusProduct: FullCusProduct;
	stripePriceId: string;
}): boolean => {
	return cusProduct.customer_prices.some(
		(cp) =>
			cp.price.config.stripe_price_id === stripePriceId ||
			cp.price.config.stripe_empty_price_id === stripePriceId,
	);
};

/**
 * Removes old items from targetItems map.
 * - Consumable: keep if ANY remaining cusProduct needs it, otherwise delete
 * - Regular: always subtract quantity, delete if <= 0
 */
const removeOldItems = ({
	targetItems,
	itemsToRemove,
	remainingCusProducts,
}: {
	targetItems: Map<string, number | undefined>;
	itemsToRemove: StripeItemSpec[];
	remainingCusProducts: FullCusProduct[]; // All cus products AFTER operation (includes new, excludes old)
}) => {
	for (const spec of itemsToRemove) {
		const priceId = spec.stripePriceId;
		const isConsumable =
			spec.autumnPrice && isConsumablePrice(spec.autumnPrice);

		// CONSUMABLE: Keep if ANY remaining cusProduct needs it
		if (isConsumable) {
			const anyNeedsIt = remainingCusProducts.some((cp) =>
				cusProductHasStripePriceId({ cusProduct: cp, stripePriceId: priceId }),
			);
			if (anyNeedsIt) continue;

			// No one needs it, delete
			targetItems.delete(priceId);
			continue;
		}

		// REGULAR: Always subtract quantity
		const existingQty = targetItems.get(priceId) ?? 0;
		const quantityToRemove = spec.quantity ?? 1;
		const newQty = (existingQty ?? 0) - quantityToRemove;

		if (newQty <= 0) {
			targetItems.delete(priceId);
		} else {
			targetItems.set(priceId, newQty);
		}
	}
};

/**
 * Convert targetItems map to Stripe subscription update params.
 * Compares with currentItems to determine add/update/delete operations.
 */
const toStripeParams = ({
	targetItems,
	currentItems,
}: {
	targetItems: Map<string, number | undefined>;
	currentItems: Stripe.SubscriptionItem[];
}): Stripe.SubscriptionUpdateParams.Item[] => {
	const result: Stripe.SubscriptionUpdateParams.Item[] = [];

	// Handle additions and updates
	for (const [priceId, quantity] of targetItems) {
		const existingItem = currentItems.find((si) => si.price?.id === priceId);

		if (existingItem) {
			// UPDATE existing item (only if quantity changed)
			const currentQty = existingItem.quantity;
			if (quantity !== currentQty) {
				result.push({ id: existingItem.id, quantity });
			}
		} else {
			// ADD new item
			result.push({ price: priceId, quantity });
		}
	}

	// Handle deletions - items in current but NOT in target
	for (const item of currentItems) {
		const priceId = item.price?.id;
		if (!priceId) continue;

		if (!targetItems.has(priceId)) {
			result.push({ id: item.id, deleted: true });
		}
	}

	return result;
};

export const buildSubItemUpdate = ({
	ctx,
	attachContext,
	ongoingCusProduct,
	newCusProducts,
}: {
	ctx: AutumnContext;
	attachContext: AttachContext;
	ongoingCusProduct?: FullCusProduct;
	newCusProducts?: FullCusProduct[];
}) => {
	const { fullCus, stripeSub } = attachContext;
	const currentItems = stripeSub?.items.data || [];

	const itemsToAdd =
		newCusProducts?.flatMap((cusProduct) =>
			cusProductToStripeItemSpecs({
				ctx,
				cusProduct,
				fromVercel: attachContext.paymentMethod?.type === "custom",
			}),
		) ?? [];

	const itemsToRemove = ongoingCusProduct
		? cusProductToStripeItemSpecs({
				ctx,
				cusProduct: ongoingCusProduct,
				fromVercel: attachContext.paymentMethod?.type === "custom", // TODO:
			})
		: [];

	// Cus products that will remain after operation (excludes old, includes existing + new)
	const existingCusProducts = filterCusProductsBySubId({
		cusProducts: fullCus.customer_products,
		subId: stripeSub?.id,
	})
		.filter((cp: FullCusProduct) => cp.id !== ongoingCusProduct?.id)
		.filter((cp: FullCusProduct) => isCusProductOngoing({ cusProduct: cp }));

	const remainingCusProducts = [
		...existingCusProducts,
		...(newCusProducts ?? []),
	];

	// Step 0: Initialize targetItems with current sub state
	const targetItems = initializeTargetItems({ currentItems });

	// Step 1: Add new items
	addNewItems({ targetItems, itemsToAdd });

	// Step 2: Remove old items
	removeOldItems({
		targetItems,
		itemsToRemove,
		remainingCusProducts,
	});

	// Step 3: Convert to Stripe params (deletions derived from diff)
	return toStripeParams({ targetItems, currentItems });
};
