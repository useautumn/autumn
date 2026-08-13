import type { FullProduct, ProductKey, RewardProgram } from "@autumn/shared";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

/** One setup/projected row for a single productKey. */
export type ProductState = {
	productKey: ProductKey;
	currentFullProduct: FullProduct;
	customerUsage: CustomerProductVersioningUsage;
};

/**
 * Product setup bag: per-key state plus plan-scoped indexes expand/errors need
 * (sibling versions, reward programs).
 */
export type ProductStatesContext = {
	/** Existing states keyed by `productKeyToString`. */
	statesByPlanVersion: Record<string, ProductState>;
	/** Existing versions per plan_id, newest first (empty = plan absent). */
	versionsByPlanId: Record<string, FullProduct[]>;
	rewardProgramsByPlanId: Record<string, RewardProgram[]>;
};

export const emptyProductStatesContext = (): ProductStatesContext => ({
	statesByPlanVersion: {},
	versionsByPlanId: {},
	rewardProgramsByPlanId: {},
});
