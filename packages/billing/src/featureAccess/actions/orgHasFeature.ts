import type { BillingFeatureId } from "../billingFeatureIds";
import type { FeatureAccessContext } from "../types/featureAccessContext";

export const orgHasFeature = async ({
	ctx,
	orgId,
	featureId,
	useEdge = false,
}: {
	ctx: FeatureAccessContext;
	orgId: string;
	featureId: BillingFeatureId;
	useEdge?: boolean;
}): Promise<boolean> => {
	const startedAt = performance.now();
	let allowed = true;
	try {
		({ allowed } = await (useEdge ? ctx.autumn.edge : ctx.autumn).check({
			customerId: orgId,
			featureId,
		}));
	} catch (error) {
		ctx.logger.warn(`${featureId} check failed, allowing the request`, {
			error,
		});
	}
	ctx.logger.info("billing_check", {
		type: "billing_check",
		data: {
			path: useEdge ? "edge" : "api",
			featureId,
			allowed,
			durationMs: Math.round(performance.now() - startedAt),
		},
	});
	return allowed;
};
