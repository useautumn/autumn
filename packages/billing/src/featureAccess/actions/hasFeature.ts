import type { BillingFeatureId } from "../billingFeatureIds";
import type { FeatureAccessContext } from "../types/featureAccessContext";
import { isPlanEnforced } from "../utils/isPlanEnforced";
import { orgHasFeature } from "./orgHasFeature";

/** A test's override first, then the plan where it is enforced; everywhere else the feature is on. */
export const hasFeature = async ({
	ctx,
	orgId,
	featureId,
}: {
	ctx: FeatureAccessContext;
	orgId: string;
	featureId: BillingFeatureId;
}): Promise<boolean> => {
	const override = ctx.overrides?.[featureId];
	if (override !== undefined) return override;
	if (!isPlanEnforced({ runtimeEnv: ctx.runtimeEnv })) return true;
	return orgHasFeature({ ctx, orgId, featureId, useEdge: ctx.useEdge });
};
