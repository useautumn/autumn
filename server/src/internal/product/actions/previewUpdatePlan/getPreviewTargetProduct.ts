import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PlanService } from "@/internal/products/PlanService.js";

// Accepts a base plan or a variant. For a variant the propagation step no-ops,
// since a variant has no children of its own.
export const getPreviewTargetProduct = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) => {
	const { db, org, env } = ctx;

	return await PlanService.getFull({
		db,
		idOrInternalId: planId,
		orgId: org.id,
		env,
		version,
	});
};
