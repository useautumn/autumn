import { type ApiPlanV1 } from "@autumn/shared";
import { findById } from "./utils/findById.js";

import revisiondojoDump from "./revisiondojo-plans.json" with { type: "json" };

const items = revisiondojoDump.items as ApiPlanV1[];

// Group 1 — Pro (base = pro_1m)
export const proBase = findById(items, "pro_1m");
export const proVariants: ApiPlanV1[] = [
	findById(items, "pro_free_grant"),
	findById(items, "pro_1m_new"),
	findById(items, "pro_1_month_mobile"),
	findById(items, "pro_1w"),
	findById(items, "pro_2m"),
	findById(items, "pro_3m"),
	findById(items, "pro_3m_special"),
	findById(items, "pro_4m"),
	findById(items, "pro_6m"),
	findById(items, "pro_6m_oneoff"),
	findById(items, "pro_12m"),
	findById(items, "pro_15m"),
	findById(items, "pro_18m"),
	findById(items, "pro_24m"),
	findById(items, "pro_m26"),
	findById(items, "pro_2m_m26"),
	findById(items, "pro_n26"),
	findById(items, "pro_8m_n26"),
	findById(items, "pro_m27"),
	findById(items, "pro_12m_oneoff"),
	findById(items, "pro_14m_m27"),
	findById(items, "pro_18m_oneoff"),
	findById(items, "pro_n27"),
	findById(items, "pro_20m_n27"),
	findById(items, "pro_24m_oneoff"),
	findById(items, "pro_26m_m28"),
	findById(items, "pro_m28"),
];

// Group 2 — Plus (base = plus_1m)
export const plusBase = findById(items, "plus_1m");
export const plusVariants: ApiPlanV1[] = [
	findById(items, "plus_free_grant"),
	findById(items, "plus_1m_new"),
	findById(items, "plus_1w"),
	findById(items, "plus_2m"),
	findById(items, "plus_3m"),
	findById(items, "plus_4m"),
	findById(items, "plus_6m"),
	findById(items, "plus_12m"),
	findById(items, "plus_15m"),
	findById(items, "plus_18m"),
	findById(items, "plus_24m"),
	findById(items, "plus_2m_m26"),
	findById(items, "plus_6m_oneoff"),
	findById(items, "plus_8m_n26"),
	findById(items, "plus_12m_oneoff"),
	findById(items, "plus_14m_m27"),
	findById(items, "plus_18m_oneoff"),
	findById(items, "plus_24m_oneoff"),
	findById(items, "plus_26m_m28"),
	findById(items, "plus_20m_n27"),
];

// Group 3 — Teacher Pro (base = pro_teacher_1m)
export const teacherProBase = findById(items, "pro_teacher_1m");
export const teacherProVariants: ApiPlanV1[] = [
	findById(items, "pro_teacher"),
	findById(items, "pro_teacher_24m"),
];
