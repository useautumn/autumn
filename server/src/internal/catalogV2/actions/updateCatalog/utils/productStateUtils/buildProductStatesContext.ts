import type { FullProduct, RewardProgram } from "@autumn/shared";
import { productKeyToString, productToProductKey } from "@autumn/shared";
import type {
	ProductState,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	type CustomerProductVersioningFlags,
	emptyVersioningFlags,
} from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

/** One ProductState per existing productKey, plus plan-scoped indexes. */
export const buildProductStatesContext = ({
	planIds,
	versionsByPlanId,
	usageByInternalId,
	rewardProgramsByPlanId,
}: {
	planIds: string[];
	versionsByPlanId: Map<string, FullProduct[]>;
	usageByInternalId: Map<string, CustomerProductVersioningFlags>;
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
					emptyVersioningFlags(),
			};
		}
	}

	return {
		statesByPlanVersion,
		versionsByPlanId: versionsByPlanIdRecord,
		rewardProgramsByPlanId: rewardProgramsByPlanIdRecord,
	};
};
