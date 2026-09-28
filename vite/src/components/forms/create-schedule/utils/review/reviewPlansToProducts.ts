import type { ProductV2 } from "@autumn/shared";
import type { ReviewPlan } from "./types/reviewChange";

export const reviewPlansToProducts = (plans: ReviewPlan[]): ProductV2[] =>
	plans.flatMap(({ product }) => (product ? [product] : []));
