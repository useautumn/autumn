import type { ApiPlanParams } from "../../../../atmn-old/src/lib/transforms/sdkToApi/plan.ts";

type DeepPartial<T> = {
	[K in keyof T]?: NonNullable<T[K]> extends (infer Element)[]
		? DeepPartial<Element>[]
		: NonNullable<T[K]> extends object
			? DeepPartial<NonNullable<T[K]>>
			: T[K];
};

export type PlanSpec = DeepPartial<ApiPlanParams> & { freePlan?: boolean };
