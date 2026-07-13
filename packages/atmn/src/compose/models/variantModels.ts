import type {
	BillingInterval,
	BillingMethod,
	FreeTrial,
	Plan as BasePlan,
	PlanItem,
	PlanPriceInterval,
	ResetInterval,
} from "./planModels.js";

type ApiBasePrice = {
	amount: number;
	interval: PlanPriceInterval;
	interval_count?: number;
};

export type PlanItemFilter = {
	featureId?: string;
	billingMethod?: BillingMethod;
	interval?: BillingInterval | ResetInterval;
	intervalCount?: number;
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
