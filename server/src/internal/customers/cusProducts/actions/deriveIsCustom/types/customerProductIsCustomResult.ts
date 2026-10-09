import type { CustomerProductCustomDiff } from "./customerProductCustomDiff";

export type CustomerProductIsCustomResult =
	| { isCustom: false; reason: "matches_catalog" | "revenuecat" }
	| { isCustom: true; reason: "customized"; diff: CustomerProductCustomDiff }
	| { isCustom: true; reason: "catalog_missing" | "comparison_failed" };
