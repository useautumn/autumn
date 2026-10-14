import {
	type CollectionMethod,
	type InsertCustomerProduct,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type { SubscriptionPreviousAttributes } from "../../stripeSubscriptionUpdatedContext";

type StripeOwnedFieldUpdates = Pick<
	Partial<InsertCustomerProduct>,
	"trial_ends_at" | "collection_method"
>;

const trialWasStripes = ({
	currentTrialEndsAt,
	previousStripeTrialEnd,
}: {
	currentTrialEndsAt: number | null;
	previousStripeTrialEnd: number | null | undefined;
}): boolean => {
	const previousStripeTrialEndsAt = previousStripeTrialEnd
		? secondsToMs(previousStripeTrialEnd)
		: null;
	if (currentTrialEndsAt === null || previousStripeTrialEndsAt === null) {
		return currentTrialEndsAt === previousStripeTrialEndsAt;
	}
	return (
		truncateMsToSecondPrecision(currentTrialEndsAt) ===
		previousStripeTrialEndsAt
	);
};

export const getStripeOwnedFieldUpdates = ({
	previousAttributes,
	current,
	stripeTrialEndsAt,
	stripeCollectionMethod,
}: {
	previousAttributes: SubscriptionPreviousAttributes;
	current?: {
		trial_ends_at: number | null | undefined;
		collection_method: CollectionMethod | null | undefined;
	};
	stripeTrialEndsAt: number | undefined;
	stripeCollectionMethod: CollectionMethod;
}): StripeOwnedFieldUpdates => {
	const updates: StripeOwnedFieldUpdates = {};

	const trialEndChanged = "trial_end" in previousAttributes;
	if (trialEndChanged) {
		const newTrialEndsAt = stripeTrialEndsAt ?? null;
		const currentTrialEndsAt = current?.trial_ends_at ?? null;
		const shouldWriteTrialEndsAt = current
			? currentTrialEndsAt !== newTrialEndsAt &&
				trialWasStripes({
					currentTrialEndsAt,
					previousStripeTrialEnd: previousAttributes.trial_end,
				})
			: true;
		if (shouldWriteTrialEndsAt) {
			updates.trial_ends_at = newTrialEndsAt;
		}
	}

	const collectionMethodChanged = "collection_method" in previousAttributes;
	if (
		collectionMethodChanged &&
		(!current || current.collection_method !== stripeCollectionMethod)
	) {
		updates.collection_method = stripeCollectionMethod;
	}

	return updates;
};
