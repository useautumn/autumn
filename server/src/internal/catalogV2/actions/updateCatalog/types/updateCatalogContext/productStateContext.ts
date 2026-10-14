import type { FullProduct, ProductKey, RewardProgram } from "@autumn/shared";
import type { CustomerProductVersioningFlags } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

export type ProductState = {
	productKey: ProductKey;
	currentFullProduct: FullProduct;
	customerUsage: CustomerProductVersioningFlags;
};

export type ProductStatesContext = {
	statesByPlanVersion: Record<string, ProductState>;
	versionsByPlanId: Record<string, FullProduct[]>;
	maxVersionByPlanId?: Record<string, number>;
	rewardProgramsByPlanId: Record<string, RewardProgram[]>;
};

export const emptyProductStatesContext = (): ProductStatesContext => ({
	statesByPlanVersion: {},
	versionsByPlanId: {},
	maxVersionByPlanId: {},
	rewardProgramsByPlanId: {},
});
