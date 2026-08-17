import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";

/** Plan ids from the given set that already exist in the target (org, env). */
export const listExistingTargetPlanIds = async ({
	toContext,
	planIds,
}: {
	toContext: AutumnContext;
	planIds: string[];
}): Promise<Set<string>> => {
	const { db, org, env } = toContext;
	const existing = await ProductService.listByIds({
		db,
		orgId: org.id,
		env,
		ids: planIds,
	});
	return new Set(existing.map((product) => product.id));
};
