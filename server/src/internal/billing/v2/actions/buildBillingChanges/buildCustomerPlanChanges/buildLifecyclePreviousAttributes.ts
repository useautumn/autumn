import {
	CusProductStatus,
	type CustomerPlanPreviousAttributes,
	customerProductToApiSubscriptionStatus,
	type FullCusProduct,
} from "@autumn/shared";

const isPastDue = (status: CusProductStatus): boolean =>
	status === CusProductStatus.PastDue;

/** Sparse diff of the public lifecycle scalars, holding their `before` values.
 * Null when nothing changed. */
export const buildLifecyclePreviousAttributes = ({
	before,
	after,
}: {
	before: FullCusProduct;
	after: FullCusProduct;
}): CustomerPlanPreviousAttributes | null => {
	const previous: CustomerPlanPreviousAttributes = {};

	// Trialing↔Active and PastDue↔Active both map to "active" publicly, so they
	// don't show here — they surface via past_due / trial_ends_at instead.
	const beforePublic = customerProductToApiSubscriptionStatus({
		status: before.status,
	});
	const afterPublic = customerProductToApiSubscriptionStatus({
		status: after.status,
	});
	if (beforePublic !== afterPublic) {
		previous.status = beforePublic;
	}

	if (isPastDue(before.status) !== isPastDue(after.status)) {
		previous.past_due = isPastDue(before.status);
	}

	const beforeCanceledAt = before.canceled_at ?? null;
	if ((after.canceled_at ?? null) !== beforeCanceledAt) {
		previous.canceled_at = beforeCanceledAt;
	}

	const beforeEndedAt = before.ended_at ?? null;
	if ((after.ended_at ?? null) !== beforeEndedAt) {
		previous.expires_at = beforeEndedAt;
	}

	const beforeTrialEndsAt = before.trial_ends_at ?? null;
	if ((after.trial_ends_at ?? null) !== beforeTrialEndsAt) {
		previous.trial_ends_at = beforeTrialEndsAt;
	}

	return Object.keys(previous).length > 0 ? previous : null;
};
