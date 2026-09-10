import type { ApiPlanParams } from "../../../../atmn/src/lib/transforms/sdkToApi/plan.ts";

type DeepPartial<T> = {
	[K in keyof T]?: NonNullable<T[K]> extends (infer Element)[]
		? DeepPartial<Element>[]
		: NonNullable<T[K]> extends object
			? DeepPartial<NonNullable<T[K]>>
			: T[K];
};

/**
 * Structural subset of the wire shape a plan must match — never matched by
 * id: several valid modelings exist and agents pick their own ids.
 */
export type PlanSpec = DeepPartial<ApiPlanParams> & { freePlan?: boolean };
