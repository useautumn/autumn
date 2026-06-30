import type { CustomizePlanV1, PlanItemFilter as ApiPlanItemFilter } from "@autumn/shared";
import type { BillingControls } from "./billingControlModels.js";
import type { FreeTrial, Plan as BasePlan, PlanItem } from "./planModels.js";

type ApiBasePrice = NonNullable<CustomizePlanV1["price"]>;

export type PlanItemFilter = {
	featureId?: ApiPlanItemFilter["feature_id"];
	billingMethod?: ApiPlanItemFilter["billing_method"];
	interval?: ApiPlanItemFilter["interval"];
	intervalCount?: ApiPlanItemFilter["interval_count"];
};

export type CustomizePlan = {
	price?:
		| (Pick<ApiBasePrice, "amount" | "interval"> & {
				intervalCount?: ApiBasePrice["interval_count"];
		  })
		| null;
	items?: PlanItem[];
	addItems?: PlanItem[];
	removeItems?: PlanItemFilter[];
	freeTrial?: FreeTrial | null;
	billingControls?: BillingControls;
};

export type Variant = {
	id: string;
	name: string;
	version?: number;
	customize?: CustomizePlan;
	readonly __atmnType?: "variant";
};

export type Plan = BasePlan & {
	version?: number;
	variants?: Variant[];
	variant?: (params: Omit<Variant, "__atmnType">) => Variant;
};
