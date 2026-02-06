import type { FeatureOptions } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { notNullish } from "@/utils/genUtils";

/**
 * Calculates quantity differences for both entitlements and Stripe subscription items.
 *
 * Entitlement difference is based on actual current vs new quantity.
 * Stripe difference accounts for upcoming_quantity to prevent double-billing when scheduled changes exist.
 *
 * @param previousOptions - Current feature options with current and upcoming quantities
 * @param updatedOptions - Desired feature options with new quantity
 * @returns Quantity differences and upgrade/downgrade indicator
 */
export const calculateUpdateQuantityDifferences = ({
	previousOptions,
	updatedOptions,
}: {
	previousOptions: FeatureOptions;
	updatedOptions: FeatureOptions;
}): {
	isUpgrade: boolean;
	quantityDifferenceForEntitlements: number;
	stripeSubscriptionItemQuantityDifference: number;
} => {
	const isUpgrade = updatedOptions.quantity > previousOptions.quantity;

	const quantityDifferenceForEntitlements = new Decimal(updatedOptions.quantity)
		.minus(previousOptions.quantity)
		.toNumber();

	const upcomingQuantityToConsider = notNullish(
		previousOptions.upcoming_quantity,
	)
		? previousOptions.upcoming_quantity
		: previousOptions.quantity;

	const stripeSubscriptionItemQuantityDifference = new Decimal(
		updatedOptions.quantity,
	)
		.minus(upcomingQuantityToConsider)
		.toNumber();

	return {
		isUpgrade,
		quantityDifferenceForEntitlements,
		stripeSubscriptionItemQuantityDifference,
	};
};
