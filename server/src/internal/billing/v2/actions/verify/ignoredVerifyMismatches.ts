import type { SubscriptionMismatch } from "@autumn/shared";

type IgnoredMismatch = {
	type: SubscriptionMismatch["type"];
	reason?: string;
};

/** Findings an org has reviewed and accepted, so verify stops reporting them.
 * Keyed by org id rather than slug to keep the customer out of the codebase. */
const IGNORED_MISMATCHES_BY_ORG: Record<string, IgnoredMismatch[]> = {
	// Schedules whose only future change is a quantity step; the subscription
	// webhook applies it, so Autumn holds no phase for it by design.
	J5DBNq2fVFPh3Od7QhKltZuRwihXHOCy: [
		{ type: "schedule_mismatch", reason: "unexpected_schedule" },
	],
};

export const isIgnoredVerifyMismatch = ({
	orgId,
	mismatch,
}: {
	orgId: string;
	mismatch: SubscriptionMismatch;
}) =>
	(IGNORED_MISMATCHES_BY_ORG[orgId] ?? []).some(
		(ignored) =>
			ignored.type === mismatch.type &&
			(ignored.reason === undefined ||
				ignored.reason === (mismatch as { reason?: string }).reason),
	);
