import { type ApiPlanV1 } from "@autumn/shared";
import { findById } from "./utils/findById.js";

// Bun-native JSON import (module: Preserve + bundler resolution).
import firecrawlDump from "./firecrawl-plans.json" with { type: "json" };

const items = firecrawlDump.items as ApiPlanV1[];

// Group 1 — Scale (base = scale_tier_1)
export const scaleTier1Base = findById(items, "scale_tier_1");
export const scaleVariants: ApiPlanV1[] = [
	findById(items, "scale_tier_2"),
	findById(items, "scale_tier_3"),
	findById(items, "scale_tier_4"),
	findById(items, "scale_tier_1_quarterly"),
	findById(items, "scale_tier_2_quarterly"),
	findById(items, "scale_tier_3_quarterly"),
	findById(items, "scale_tier_4_quarterly"),
	findById(items, "scale_monthly"),
];

// Group 2 — Hobby (base = hobby)
export const hobbyBase = findById(items, "hobby");
export const hobbyVariants: ApiPlanV1[] = [
	findById(items, "hobby_yearly"),
	findById(items, "hobby_monthly_5k"),
	findById(items, "hobby_monthly_6_5k"),
	findById(items, "hobby_monthly_8k"),
	findById(items, "hobby_yearly_5k"),
	findById(items, "hobby_yearly_6_5k"),
	findById(items, "hobby_yearly_8k"),
];

// Group 3 — Standard (base = standard)
export const standardBase = findById(items, "standard");
export const standardVariants: ApiPlanV1[] = [
	findById(items, "standard_yearly"),
	findById(items, "standard_monthly_100k"),
	findById(items, "standard_monthly_130k"),
	findById(items, "standard_monthly_160k"),
	findById(items, "standard_yearly_100k"),
	findById(items, "standard_yearly_130k"),
	findById(items, "standard_yearly_160k"),
];

// Group 4 — Growth (base = growth)
export const growthBase = findById(items, "growth");
export const growthVariants: ApiPlanV1[] = [
	findById(items, "growth_yearly"),
	findById(items, "growth_monthly_500k"),
	findById(items, "growth_monthly_650k"),
	findById(items, "growth_monthly_800k"),
	findById(items, "growth_yearly_500k"),
	findById(items, "growth_yearly_650k"),
];
