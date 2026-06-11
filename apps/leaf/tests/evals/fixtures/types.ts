import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiCustomerSchedule } from "@api/customers/components/apiCustomerSchedule";
import type { ApiEntityV2 } from "@api/entities/apiEntityV2.js";
import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { AgentRules } from "@autumn/shared";

export type PlanRef = ApiPlanV1 | ApiPlanV1[];
export type ScheduleRef = ApiCustomerSchedule | ApiCustomerSchedule[];
export type EntityRef = ApiEntityV2 | ApiEntityV2[];
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
	Entities extends Record<string, EntityRef> = Record<string, EntityRef>,
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
	entities: {
		[Key in keyof Entities]: Entities[Key] extends ApiEntityV2[]
			? Array<RefIds<Entities[Key][number]>>
			: Entities[Key] extends ApiEntityV2
				? RefIds<Entities[Key]>
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
	Entities extends Record<string, EntityRef> = Record<string, EntityRef>,
> = {
	agentRules: AgentRules;
	features: Features;
	plans: Plans;
	customers: Customers;
	schedules: Schedules;
	entities: Entities;
};

export type EvalSetup<
	Features extends Record<string, ApiFeatureV1> = Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef> = Record<string, PlanRef>,
	Customers extends Record<
		string,
		BaseApiCustomerV5 | BaseApiCustomerV5[]
	> = Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef> = Record<string, ScheduleRef>,
	Entities extends Record<string, EntityRef> = Record<string, EntityRef>,
> = {
	tag: string;
	ids: EvalSetupIds<Features, Plans, Customers, Schedules, Entities>;
	agentRules: AgentRules;
	features: ApiFeatureV1[];
	plans: ApiPlanV1[];
	customers: BaseApiCustomerV5[];
	schedules: ApiCustomerSchedule[];
	entities: ApiEntityV2[];
	refs: EvalSetupRefs<Features, Plans, Customers, Schedules, Entities>;
};
