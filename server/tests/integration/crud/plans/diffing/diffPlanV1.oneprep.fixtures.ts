import { type ApiPlanV1 } from "@autumn/shared";
import { findById } from "./utils/findById.js";

import oneprepDump from "./oneprep-plans.json" with { type: "json" };

const items = oneprepDump.items as ApiPlanV1[];

export const proBase = findById(items, "pro_1m");
export const proVariants: ApiPlanV1[] = [
	findById(items, "pro_1w"),
	findById(items, "pro_3m"),
	findById(items, "pro_6m"),
	findById(items, "pro_12m"),
	findById(items, "pro_june_2026"),
];
