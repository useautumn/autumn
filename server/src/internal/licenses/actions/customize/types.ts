import type {
	CustomizePlanLicense,
	DbPlanLicense,
	FullProduct,
} from "@autumn/shared";
import type { LicenseCustomizeComputation } from "./computeLicenseCustomize.js";

export type ResolvedLicenseAdd = {
	entry: CustomizePlanLicense;
	licenseProduct: FullProduct;
	included: number;
	prepaidOnly: boolean;
	metadata: Record<string, unknown>;
	/** Set when the entry customizes items; null otherwise. */
	computation: LicenseCustomizeComputation | null;
	/** True when the entry passed customize: null to clear items to stock. */
	clearItems: boolean;
	catalogLink?: DbPlanLicense;
	existingOverride?: DbPlanLicense;
};

export type ResolvedLicenseRemove = {
	licensePlanId: string;
	licenseProduct: FullProduct;
	catalogLink?: DbPlanLicense;
	existingOverride?: DbPlanLicense;
};

export type ResolvedLicensePatch = {
	adds: ResolvedLicenseAdd[];
	removes: ResolvedLicenseRemove[];
};
