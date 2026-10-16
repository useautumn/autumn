import type { BillingFeatureId } from "../billingFeatureIds";
import type { FeatureAccessContext } from "../types/featureAccessContext";

/** Fails open like every gate on Autumn's own billing: an unreachable Autumn allows. */
export const orgHasFeature = async ({
	ctx,
	orgId,
	featureId,
	useEdge = false,
}: {
	ctx: Pick<FeatureAccessContext, "autumn" | "logger">;
	orgId: string;
	featureId: BillingFeatureId;
	/** Ask Autumn's own Atom first; the SDK falls back to the Autumn API when it's down. */
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
