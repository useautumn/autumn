import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/featureState";
import type { PreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/previewCatalogContext";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext/productStateContext";

/** Everything setup fetches; compute and errors read only from here. */
export interface UpdateCatalogContext {
	/** Dependency + rewrite overflow flags, keyed by feature id. */
	featureStatesContext: Record<string, FeatureState>;
	productStatesContext: ProductStatesContext;
	/** Present iff the action ran with preview: true. */
	previewContext?: PreviewCatalogContext;
}
