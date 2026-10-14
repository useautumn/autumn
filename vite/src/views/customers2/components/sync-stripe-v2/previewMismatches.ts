import type { SubscriptionMismatch, SyncPhase } from "@autumn/shared";

const MAX_PHASE_START_DRIFT_MS = 24 * 60 * 60 * 1000;

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

const FUTURE_PHASES_UNCOMPARED_REASONS = new Set([
	"missing_schedule",
	"unexpected_schedule",
	"phase_count_mismatch",
]);

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
	if (!wasPhaseCompared({ mismatches: previewMismatches, startsAt }))
		return undefined;
	if (
		flagsStripePrice({ mismatches: previewMismatches, stripePriceId, startsAt })
	)
		return "out_of_sync";
	const isLinkedToday =
		wasPhaseCompared({ mismatches: todayMismatches, startsAt }) &&
		!flagsStripePrice({ mismatches: todayMismatches, stripePriceId, startsAt });
	return isLinkedToday ? "linked" : "links_on_sync";
};

export const rollUpStripeItemMarks = (
	marks: (StripeItemMark | undefined)[],
): StripeItemMark | undefined => {
	if (marks.length === 0 || marks.some((mark) => !mark)) return undefined;
	if (marks.includes("out_of_sync")) return "out_of_sync";
	if (marks.includes("links_on_sync")) return "links_on_sync";
	return "linked";
};

const isMissingPlanPrice = (mismatch: SubscriptionMismatch) => {
	if (mismatch.type === "item_mismatch") return mismatch.reason === "missing";
	if (mismatch.type === "base_price_mismatch")
		return mismatch.reason === "missing";
	if (mismatch.type === "prepaid_quantity_mismatch")
		return mismatch.actual_quantity === 0 && mismatch.expected_quantity > 0;
	return false;
};

export const findMissingPlanPrices = ({
	previewMismatches,
	planId,
	startsAt,
}: {
	previewMismatches: SubscriptionMismatch[] | undefined;
	planId: string;
	startsAt: SyncPhase["starts_at"];
}): SubscriptionMismatch[] => {
	if (!previewMismatches) return [];
	if (!wasPhaseCompared({ mismatches: previewMismatches, startsAt })) return [];
	return previewMismatches.filter(
		(mismatch) =>
			isMissingPlanPrice(mismatch) &&
			"plan_id" in mismatch &&
			mismatch.plan_id === planId &&
			isMismatchInPhase({ mismatch, startsAt }),
	);
};
