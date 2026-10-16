import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { featureEditToFacts } from "@/internal/approvals/facts/catalog/featureEditToFacts";
import { planEditToFacts } from "@/internal/approvals/facts/catalog/planEditToFacts";
import { ProductService } from "@/internal/products/ProductService";
import { checkRouteApproval } from "./checkRouteApproval";

const distinctIds = (ids: (string | null | undefined)[]) => [
	...new Set(
		ids.filter((id): id is string => typeof id === "string" && id !== ""),
	),
];

/** Every plan and feature a request edits, each judged on its own id. */
export const checkCatalogEditApprovals = async ({
	ctx,
	planIds = [],
	featureIds = [],
	includeExisting = false,
}: {
	ctx: AutumnContext;
	planIds?: (string | null | undefined)[];
	featureIds?: (string | null | undefined)[];
	/** A bulk update that deletes what it doesn't state may edit every existing plan and feature. */
	includeExisting?: boolean;
}) => {
	if (includeExisting) {
		const existingPlans = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		planIds = [...planIds, ...existingPlans.map(({ id }) => id)];
		featureIds = [...featureIds, ...ctx.features.map(({ id }) => id)];
	}

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
