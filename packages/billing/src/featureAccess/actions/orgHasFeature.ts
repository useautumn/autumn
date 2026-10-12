import type { BillingFeatureId } from "../billingFeatureIds";
import type { FeatureAccessContext } from "../types/featureAccessContext";

/** Fails open like every gate on Autumn's own billing: an unreachable Autumn allows. */
export const orgHasFeature = async ({
	ctx,
	orgId,
	featureId,
}: {
	ctx: FeatureAccessContext;
	orgId: string;
	featureId: BillingFeatureId;
}): Promise<boolean> => {
	try {
		const { allowed } = await ctx.autumn.check({
			customerId: orgId,
			featureId,
		});
		return allowed;
	} catch (error) {
		ctx.logger.warn(`${featureId} check failed, allowing the request`, {
			error,
		});
		return true;
	}
};
