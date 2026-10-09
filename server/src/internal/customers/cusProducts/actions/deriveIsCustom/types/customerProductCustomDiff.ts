import type {
	ApiPlanLicenseV1,
	CreatePlanItemParamsV1,
	DiffedCustomizePlanV1,
} from "@autumn/shared";
import type { BasePriceParams } from "@autumn/shared/api/products/components/basePrice/basePrice";

export type CustomizedPlanItem = {
	feature_id: string;
	catalog: CreatePlanItemParamsV1 | null;
	customer: CreatePlanItemParamsV1 | null;
};

export type CustomizedPlanLicense = {
	license_plan_id: string;
	catalog: ApiPlanLicenseV1 | null;
	customer: ApiPlanLicenseV1 | null;
};

export type CustomerProductCustomDiff = {
	price?: { catalog: BasePriceParams | null; customer: BasePriceParams | null };
	items?: CustomizedPlanItem[];
	upsert_licenses?: DiffedCustomizePlanV1["upsert_licenses"];
	remove_licenses?: DiffedCustomizePlanV1["remove_licenses"];
	licenses?: CustomizedPlanLicense[];
};

export type CustomDiffField = {
	path: string;
	catalog: string | null;
	customer: string | null;
};

export type CustomDiffChange = {
	target: "base_price" | "item" | "license";
	id: string | null;
	kind: "added" | "removed" | "changed";
	fields: CustomDiffField[];
};
