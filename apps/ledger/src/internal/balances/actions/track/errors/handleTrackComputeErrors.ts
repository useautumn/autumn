import {
	type FullCusEntWithFullCusProduct,
	featureUtils,
	InsufficientBalanceError,
	RecaseError,
} from "@autumn/shared";
import type { TrackContext } from "../types/trackContext.js";
import type { TrackPlan } from "../types/trackPlan.js";

const DEFAULT_VALUE = 1;

// Allocated v1 keeps its track on the server's Postgres lane. Prices are not
// mirrored yet, so the ledger refuses every allocated (continuous) feature
// rather than only the priced ones the server rejects.
const isUnsupportedAllocatedCustomerEntitlement = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): boolean => featureUtils.isAllocated(customerEntitlement.entitlement.feature);

// Row 37: the server routes allocated v1 to its Postgres lane, so the ledger
// must never fold one.
const assertNoAllocatedEntitlement = ({
	trackContext,
}: {
	trackContext: TrackContext;
}): void => {
	const allocated = trackContext.subject.customerEntitlements.find(
		isUnsupportedAllocatedCustomerEntitlement,
	);
	if (!allocated) return;

	throw new RecaseError({
		message: `Allocated feature ${allocated.entitlement.feature.id} is not supported by the ledger`,
		code: "paid_allocated_unsupported",
		statusCode: 400,
	});
};

// Row 74: a reject-mode shortfall abandons every write.
const assertNothingRejected = ({
	trackContext,
	plan,
}: {
	trackContext: TrackContext;
	plan: TrackPlan;
}): void => {
	const { body } = trackContext.command;
	if (plan.remaining <= 0 || trackContext.options.overageBehaviour !== "reject")
		return;

	throw new InsufficientBalanceError({
		value: body.value ?? DEFAULT_VALUE,
		featureId: body.feature_id,
		eventName: body.event_name,
	});
};

export const handleTrackComputeErrors = ({
	trackContext,
	plan,
}: {
	trackContext: TrackContext;
	plan: TrackPlan;
}): void => {
	assertNoAllocatedEntitlement({ trackContext });
	assertNothingRejected({ trackContext, plan });
};
