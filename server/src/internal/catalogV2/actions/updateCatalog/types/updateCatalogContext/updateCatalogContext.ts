import type { FullProduct } from "@autumn/shared";
import type { InternalIdRefs } from "@/internal/catalogV2/actions/updateCatalog/setup/resolveInternalIdRefs";
import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/featureState";
import type { LicenseStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/licenseStatesContext";
import type { PreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/previewCatalogContext";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/productStateContext";
import type { RewardStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/rewardStatesContext";

export interface UpdateCatalogContext {
	featureStatesContext: Record<string, FeatureState>;
	productStatesContext: ProductStatesContext;
	internalIdRefs: InternalIdRefs;
	licenseStatesContext: LicenseStatesContext;
	rewardStatesContext: RewardStatesContext;
	previewContext?: PreviewCatalogContext;
}
