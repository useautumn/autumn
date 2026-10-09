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

/** One leaf that differs; values are JSON-encoded, null when that side lacks the field. */
export type CustomDiffField = {
	path: string;
	catalog: string | null;
	customer: string | null;
};

/** A readable entry of a diff: what changed, and how, field by field. */
export type CustomDiffChange = {
	target: "base_price" | "item" | "license";
	/** The feature id for items, the license plan id for licenses. */
	id: string | null;
	kind: "added" | "removed" | "changed";
	fields: CustomDiffField[];
};
