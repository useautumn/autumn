import type { SubscriptionMismatch, SyncPhase } from "@autumn/shared";

/** Verify's future-phase start comes from Autumn's anchored dates, which can
 * drift from Stripe's phase start by minutes. */
const MAX_PHASE_START_DRIFT_MS = 24 * 60 * 60 * 1000;

/** Verify stamps future-phase mismatches with the phase start in seconds; an
 * unstamped mismatch belongs to the live phase. */
const isMismatchInPhase = ({
	mismatch,
	startsAt,
}: {
	mismatch: SubscriptionMismatch;
	startsAt: SyncPhase["starts_at"];
}) => {
	const phaseStart =
		"phase_starts_at" in mismatch ? mismatch.phase_starts_at : undefined;
	if (startsAt === "now") return phaseStart === undefined;
	return (
		phaseStart !== undefined &&
		Math.abs(phaseStart * 1000 - startsAt) <= MAX_PHASE_START_DRIFT_MS
	);
};

/** Schedule problems that stop verify from reliably comparing future phases. */
const FUTURE_PHASES_UNCOMPARED_REASONS = new Set([
	"missing_schedule",
	"unexpected_schedule",
	"phase_count_mismatch",
]);

/** Verify sometimes skips a phase's items, and then "no mismatch" means
 * "not checked" rather than "matched". */
const wasPhaseCompared = ({
	mismatches,
	startsAt,
}: {
	mismatches: SubscriptionMismatch[];
	startsAt: SyncPhase["starts_at"];
}) =>
	!mismatches.some((mismatch) => {
		if (mismatch.type === "expected_state_error") return true;
		if (mismatch.type !== "schedule_mismatch") return false;
		if (mismatch.reason === "phase_start_mismatch")
			return isMismatchInPhase({ mismatch, startsAt });
		return (
			startsAt !== "now" &&
			FUTURE_PHASES_UNCOMPARED_REASONS.has(mismatch.reason)
		);
	});

const flagsStripePrice = ({
	mismatches,
	stripePriceId,
	startsAt,
}: {
	mismatches: SubscriptionMismatch[];
	stripePriceId: string;
	startsAt: SyncPhase["starts_at"];
}) =>
	mismatches.some(
		(mismatch) =>
			"actual_price_id" in mismatch &&
			mismatch.actual_price_id === stripePriceId &&
			isMismatchInPhase({ mismatch, startsAt }),
	);

export type StripeItemMark = "linked" | "links_on_sync" | "out_of_sync";

/**
 * Linked: verify pairs the Stripe item today. Links on sync: only once this
 * draft syncs. Out of sync: verify would still flag it after the sync.
 * No mark until both answers are in, or when either run skipped the phase.
 */
export const stripeItemMark = ({
	todayMismatches,
	previewMismatches,
	stripePriceId,
	startsAt,
}: {
	todayMismatches: SubscriptionMismatch[] | undefined;
	previewMismatches: SubscriptionMismatch[] | undefined;
	stripePriceId: string;
	startsAt: SyncPhase["starts_at"];
}): StripeItemMark | undefined => {
	if (!todayMismatches || !previewMismatches) return undefined;
	const bothRunsComparedPhase = [todayMismatches, previewMismatches].every(
		(mismatches) => wasPhaseCompared({ mismatches, startsAt }),
	);
	if (!bothRunsComparedPhase) return undefined;
	if (
		flagsStripePrice({ mismatches: previewMismatches, stripePriceId, startsAt })
	)
		return "out_of_sync";
	return flagsStripePrice({
		mismatches: todayMismatches,
		stripePriceId,
		startsAt,
	})
		? "links_on_sync"
		: "linked";
};

const isMissingPlanPrice = (mismatch: SubscriptionMismatch) => {
	if (mismatch.type === "item_mismatch") return mismatch.reason === "missing";
	if (mismatch.type === "base_price_mismatch")
		return mismatch.reason === "missing";
	if (mismatch.type === "prepaid_quantity_mismatch")
		return mismatch.actual_quantity === 0 && mismatch.expected_quantity > 0;
	return false;
};

/** A plan with a price verify would find no Stripe item for after the sync. A
 * free plan expects no items, so it is never flagged. */
export const isPlanPriceMissing = ({
	previewMismatches,
	planId,
	startsAt,
}: {
	previewMismatches: SubscriptionMismatch[] | undefined;
	planId: string;
	startsAt: SyncPhase["starts_at"];
}) => {
	if (!previewMismatches) return false;
	if (!wasPhaseCompared({ mismatches: previewMismatches, startsAt }))
		return false;
	return previewMismatches.some(
		(mismatch) =>
			isMissingPlanPrice(mismatch) &&
			"plan_id" in mismatch &&
			mismatch.plan_id === planId &&
			isMismatchInPhase({ mismatch, startsAt }),
	);
};
