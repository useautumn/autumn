import type { CustomerProductCustomDiff } from "./customerProductCustomDiff";

/** One thing that makes a customer product custom; a plan can have many. */
export type CustomReason =
	| { kind: "price_added" | "price_removed" | "price_changed" }
	| {
			kind: "item_added" | "item_removed" | "item_changed";
			feature_id: string;
	  }
	| {
			kind: "license_added" | "license_removed" | "license_changed";
			license_plan_id: string;
	  };

/** `outcome` is how the check concluded; `reasons` lists every difference behind `customized`. */
export type CustomerProductIsCustomResult =
	| { isCustom: false; outcome: "matches_catalog" | "revenuecat" }
	| {
			isCustom: true;
			outcome: "customized";
			reasons: CustomReason[];
			diff: CustomerProductCustomDiff;
	  }
	| { isCustom: true; outcome: "catalog_missing" | "comparison_failed" };

export type IsCustomOutcome = CustomerProductIsCustomResult["outcome"];
