import type { PlanLicense, ProductV2 } from "@autumn/shared";

export interface ProductDataCatalogLicense {
	planLicense: PlanLicense;
	license: ProductV2;
}

export interface ProductDataResponse {
	product: ProductV2;
	catalogLicenses: ProductDataCatalogLicense[];
}
