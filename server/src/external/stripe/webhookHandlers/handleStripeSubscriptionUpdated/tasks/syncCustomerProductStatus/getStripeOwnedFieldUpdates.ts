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

/**
 * Stripe's `subscription.updated` carries the whole subscription, but only
 * `previous_attributes` says what actually changed. A Stripe subscription can
 * hold Autumn products whose trial or collection method Stripe never knew
 * about (a trial product merged onto a shared paid subscription, a trial that
 * lives in a schedule phase), so copying `trial_end` / `collection_method`
 * from the subscription on every event silently erases them. Only mirror those
 * fields when Stripe itself changed them; status is always Stripe's to own.
 *
 * Even when Stripe did change `trial_end`, a shared subscription can carry
 * both its own trial and an Autumn-only one, so `trial_ends_at` moves only on
 * products whose trial was Stripe's — i.e. matched Stripe's previous value.
 * Autumn keeps ms and Stripe keeps seconds, so the match is at second
 * precision, as in `normalizeCustomerProductTimestamps`.
 *
 * Pass `current` to skip no-op writes. Omit it for a blind bulk write, where
 * every field Stripe changed is written.
 */
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
