import { atomAccess } from "./actions/atomAccess";
import { hasFeature } from "./actions/hasFeature";
import type { BillingFeatureId } from "./billingFeatureIds";
import type { FeatureAccessContext } from "./types/featureAccessContext";

/** Every decision on what Autumn's own billing lets an org use: test overrides, environment exclusions and fail-open live here once. */
export const createFeatureAccess = ({
	ctx,
}: {
	ctx: FeatureAccessContext;
}) => ({
	hasFeature: (params: { orgId: string; featureId: BillingFeatureId }) =>
		hasFeature({ ctx, ...params }),
	atoms: (params: { orgId: string; countActive: () => Promise<number> }) =>
		atomAccess({ ctx, ...params }),
});

export type FeatureAccess = ReturnType<typeof createFeatureAccess>;
