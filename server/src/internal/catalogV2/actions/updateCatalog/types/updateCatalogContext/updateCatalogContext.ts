import type { FullProduct } from "@autumn/shared";
import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/featureState";
import type { LicenseStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/licenseStatesContext";
import type { PreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/previewCatalogContext";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/productStateContext";

/** Everything setup fetches; compute and errors read only from here. */
export interface UpdateCatalogContext {
	/** Dependency + rewrite overflow flags, keyed by feature id. */
	featureStatesContext: Record<string, FeatureState>;
	productStatesContext: ProductStatesContext;
	/** Persisted plan versions referencing a feature being enabled for invoice credits. */
	invoiceCreditProducts: FullProduct[];
	licenseStatesContext: LicenseStatesContext;
	/** Present iff the action ran with preview: true. */
	previewContext?: PreviewCatalogContext;
}
