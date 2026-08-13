import type { FullProduct, RewardProgram } from "@autumn/shared";
import { productKeyToString, productToProductKey } from "@autumn/shared";
import type {
	ProductState,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const emptyCustomerUsage = (): CustomerProductVersioningUsage => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	versionableCustomerCount: 0,
});

/** One ProductState per existing productKey, plus plan-scoped indexes. */
export const buildProductStatesContext = ({
	planIds,
	versionsByPlanId,
	usageByInternalId,
	rewardProgramsByPlanId,
}: {
	planIds: string[];
	versionsByPlanId: Map<string, FullProduct[]>;
	usageByInternalId: Map<string, CustomerProductVersioningUsage>;
	rewardProgramsByPlanId: Map<string, RewardProgram[]>;
}): ProductStatesContext => {
	const statesByPlanVersion: Record<string, ProductState> = {};
	const versionsByPlanIdRecord: ProductStatesContext["versionsByPlanId"] = {};
	const rewardProgramsByPlanIdRecord: ProductStatesContext["rewardProgramsByPlanId"] =
		{};

	for (const planId of planIds) {
		const versions = versionsByPlanId.get(planId) ?? [];
		versionsByPlanIdRecord[planId] = versions;
		rewardProgramsByPlanIdRecord[planId] =
			rewardProgramsByPlanId.get(planId) ?? [];

		for (const currentFullProduct of versions) {
			const productKey = productToProductKey({ product: currentFullProduct });
			statesByPlanVersion[productKeyToString({ productKey })] = {
				productKey,
				currentFullProduct,
				customerUsage:
					usageByInternalId.get(currentFullProduct.internal_id) ??
					emptyCustomerUsage(),
			};
		}
	}

	return {
		statesByPlanVersion,
		versionsByPlanId: versionsByPlanIdRecord,
		rewardProgramsByPlanId: rewardProgramsByPlanIdRecord,
	};
};
