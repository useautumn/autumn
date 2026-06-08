import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiCustomerSchedule } from "@api/customers/components/apiCustomerSchedule";
import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

export type PlanRef = ApiPlanV1 | ApiPlanV1[];
export type ScheduleRef = ApiCustomerSchedule | ApiCustomerSchedule[];
type RefId<Value extends { id?: string | null }> = Value["id"];
type RefIds<Value extends { id?: string | null }> = Value extends unknown[]
	? never
	: RefId<Value>;

export type EvalSetupIds<
	Features extends Record<string, ApiFeatureV1> = Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef> = Record<string, PlanRef>,
	Customers extends Record<
		string,
		BaseApiCustomerV5 | BaseApiCustomerV5[]
	> = Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef> = Record<string, ScheduleRef>,
> = {
	features: {
		[Key in keyof Features]: RefIds<Features[Key]>;
	};
	plans: {
		[Key in keyof Plans]: Plans[Key] extends ApiPlanV1[]
			? Array<RefIds<Plans[Key][number]>>
			: Plans[Key] extends ApiPlanV1
				? RefIds<Plans[Key]>
				: never;
	};
	customers: {
		[Key in keyof Customers]: Customers[Key] extends BaseApiCustomerV5[]
			? Array<RefIds<Customers[Key][number]>>
			: Customers[Key] extends BaseApiCustomerV5
				? RefIds<Customers[Key]>
				: never;
	};
	schedules: {
		[Key in keyof Schedules]: Schedules[Key] extends ApiCustomerSchedule[]
			? Array<RefIds<Schedules[Key][number]>>
			: Schedules[Key] extends ApiCustomerSchedule
				? RefIds<Schedules[Key]>
				: never;
	};
};

export type EvalSetupRefs<
	Features extends Record<string, ApiFeatureV1> = Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef> = Record<string, PlanRef>,
	Customers extends Record<
		string,
		BaseApiCustomerV5 | BaseApiCustomerV5[]
	> = Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef> = Record<string, ScheduleRef>,
> = {
	features: Features;
	plans: Plans;
	customers: Customers;
	schedules: Schedules;
};

export type EvalSetup<
	Features extends Record<string, ApiFeatureV1> = Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef> = Record<string, PlanRef>,
	Customers extends Record<
		string,
		BaseApiCustomerV5 | BaseApiCustomerV5[]
	> = Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef> = Record<string, ScheduleRef>,
> = {
	tag: string;
	ids: EvalSetupIds<Features, Plans, Customers, Schedules>;
	features: ApiFeatureV1[];
	plans: ApiPlanV1[];
	customers: BaseApiCustomerV5[];
	schedules: ApiCustomerSchedule[];
	refs: EvalSetupRefs<Features, Plans, Customers, Schedules>;
};
