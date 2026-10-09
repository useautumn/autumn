import type {
	ApiPlanLicenseV1,
	CreatePlanItemParamsV1,
	DiffedCustomizePlanV1,
} from "@autumn/shared";
import type { BasePriceParams } from "@autumn/shared/api/products/components/basePrice/basePrice";

/** A catalog-only item was removed, a customer-only item was added, both means changed. */
export type CustomizedPlanItem = {
	feature_id: string;
	catalog: CreatePlanItemParamsV1 | null;
	customer: CreatePlanItemParamsV1 | null;
};

/** A license link on one side only was added or removed; on both sides, its terms changed. */
export type CustomizedPlanLicense = {
	license_plan_id: string;
	catalog: ApiPlanLicenseV1 | null;
	customer: ApiPlanLicenseV1 | null;
};

/** What makes a customer product custom, side by side with the catalog version it points at. */
export type CustomerProductCustomDiff = {
	price?: { catalog: BasePriceParams | null; customer: BasePriceParams | null };
	items?: CustomizedPlanItem[];
	upsert_licenses?: DiffedCustomizePlanV1["upsert_licenses"];
	remove_licenses?: DiffedCustomizePlanV1["remove_licenses"];
	/** The changed license links with both sides, for display. */
	licenses?: CustomizedPlanLicense[];
};
