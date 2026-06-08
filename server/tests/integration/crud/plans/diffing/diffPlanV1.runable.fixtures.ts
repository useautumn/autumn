import { type ApiPlanV1 } from "@autumn/shared";
import { findById } from "./utils/findById.js";

import runableDump from "./runable-plans.json" with { type: "json" };

const items = runableDump.items as ApiPlanV1[];

// Group 1 — Credit packs (base = runable_pro_25_monthly)
export const creditPackBase = findById(items, "runable_pro_25_monthly");
export const creditPackVariants: ApiPlanV1[] = [
	findById(items, "runable_pro_50_monthly"),
	findById(items, "runable_pro_75_monthly"),
	findById(items, "runable_pro_100_monthly"),
	findById(items, "runable_pro_200_monthly"),
	findById(items, "runable_pro_300_monthly"),
	findById(items, "runable_pro_400_monthly"),
	findById(items, "runable_pro_500_monthly"),
	findById(items, "runable_pro_750_monthly"),
	findById(items, "runable_pro_1000_monthly"),
	findById(items, "runable_pro_1500_monthly"),
	findById(items, "runable_pro_2000_monthly"),
	findById(items, "runable_pro_5000_monthly"),
	findById(items, "runable_pro_10000_monthly"),
	findById(items, "runable_pro_20000_monthly"),
	findById(items, "runable_pro_25_yearly"),
	findById(items, "runable_pro_50_yearly"),
	findById(items, "runable_pro_75_yearly"),
	findById(items, "runable_pro_100_yearly"),
	findById(items, "runable_pro_200_yearly"),
	findById(items, "runable_pro_300_yearly"),
	findById(items, "runable_pro_400_yearly"),
	findById(items, "runable_pro_500_yearly"),
	findById(items, "runable_pro_750_yearly"),
	findById(items, "runable_pro_1000_yearly"),
	findById(items, "runable_pro_1500_yearly"),
	findById(items, "runable_pro_2000_yearly"),
	findById(items, "runable_pro_5000_yearly"),
	findById(items, "runable_pro_10000_yearly"),
	findById(items, "runable_pro_20000_yearly"),
];

// Group 2 — Plus tier
export const plusBase = findById(items, "runable_plus_monthly");
export const plusVariants: ApiPlanV1[] = [findById(items, "runable_plus_yearly")];

// Group 3 — Pro tier
export const proBase = findById(items, "runable_pro_monthly");
export const proVariants: ApiPlanV1[] = [findById(items, "runable_pro_yearly")];

// Group 4 — Unlimited tier
export const unlimitedBase = findById(items, "runable_unlimited_monthly");
export const unlimitedVariants: ApiPlanV1[] = [findById(items, "runable_unlimited_yearly")];

// Group 5 — Free/starter
export const freeStarterBase = findById(items, "runable_go");
export const freeStarterVariants: ApiPlanV1[] = [
	findById(items, "runable_basic"),
	findById(items, "runable_starter_monthly"),
	findById(items, "runable_starter_yearly"),
];

// Group 6 — Max tier
export const maxBase = findById(items, "runable_max_monthly");
export const maxVariants: ApiPlanV1[] = [findById(items, "runable_max_yearly")];
