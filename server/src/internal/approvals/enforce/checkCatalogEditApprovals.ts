import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { featureEditToFacts } from "@/internal/approvals/facts/catalog/featureEditToFacts";
import { planEditToFacts } from "@/internal/approvals/facts/catalog/planEditToFacts";
import { checkRouteApproval } from "./checkRouteApproval";

const distinctIds = (ids: unknown[]) => [
	...new Set(
		ids.filter((id): id is string => typeof id === "string" && id !== ""),
	),
];

/** Every plan and feature a request edits, each judged on its own id. */
export const checkCatalogEditApprovals = async ({
	ctx,
	planIds = [],
	featureIds = [],
}: {
	ctx: AutumnContext;
	planIds?: unknown[];
	featureIds?: unknown[];
}) => {
	for (const planId of distinctIds(planIds)) {
		await checkRouteApproval({
			ctx,
			action: "catalog.edit_plans",
			buildFacts: async () => planEditToFacts({ planId }),
		});
	}
	for (const featureId of distinctIds(featureIds)) {
		await checkRouteApproval({
			ctx,
			action: "catalog.edit_features",
			buildFacts: async () => featureEditToFacts({ featureId }),
		});
	}
};
