import type { FeatureOptions } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { notNullish } from "@/utils/genUtils";

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
