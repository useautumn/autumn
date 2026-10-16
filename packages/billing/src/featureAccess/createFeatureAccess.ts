import { getAtomLimits } from "./actions/getAtomLimits";
import { hasFeature } from "./actions/hasFeature";
import type { BillingFeatureId } from "./billingFeatureIds";
import type { FeatureAccessContext } from "./types/featureAccessContext";

/** Every decision on what Autumn's own billing lets an org use: test overrides, environment exclusions and fail-open live here once. */
export const createFeatureAccess = ({
	ctx,
}: {
	ctx: FeatureAccessContext;
}) => ({
	/** Decides whether the org's plan includes the feature. */
	hasFeature: (params: { orgId: string; featureId: BillingFeatureId }) =>
		hasFeature({ ctx, ...params }),
	/** Decides whether the org can create another Atom, given how many it runs now. */
	getAtomLimits: (params: { orgId: string; activeAtoms: number }) =>
		getAtomLimits({ ctx, ...params }),
});

export type FeatureAccess = ReturnType<typeof createFeatureAccess>;
