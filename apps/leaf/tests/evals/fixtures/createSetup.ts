import type { BaseApiCustomerV5 } from "@api/customers/apiCustomerV5.js";
import type { ApiCustomerSchedule } from "@api/customers/components/apiCustomerSchedule";
import type { ApiEntityV2 } from "@api/entities/apiEntityV2.js";
import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { AgentRules } from "@autumn/shared";
import { agentRules as agentRulesFixture } from "./agentRules/index.js";
import {
	balances as balanceFixtures,
	customers as customerFixtures,
	customerList as customerListFixture,
	schedules as scheduleFixtures,
	subscriptions as subscriptionFixtures,
} from "./customers/index.js";
import { entities as entityFixtures } from "./entities/index.js";
import {
	basePrice as basePriceFixture,
	features as featureFixtures,
	featureList as featureListFixture,
	items as itemFixtures,
	itemList as itemListFixture,
	plan as planFixture,
	planList as planListFixture,
} from "./plans/index.js";
import type {
	EntityRef,
	EvalSetup,
	EvalSetupIds,
	PlanRef,
	ScheduleRef,
} from "./types.js";

const flattenRecordValues = <Value>(record: Record<string, Value | Value[]>) =>
	Object.values(record).flatMap((value) =>
		Array.isArray(value) ? value : [value],
	);

const refIds = <Value extends { id?: string | null }>(
	record: Record<string, Value | Value[]>,
) =>
	Object.fromEntries(
		Object.entries(record).map(([key, value]) => [
			key,
			Array.isArray(value) ? value.map((item) => item.id) : value.id,
		]),
	);

const setupIds = <
	Features extends Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef>,
	Customers extends Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef>,
	Entities extends Record<string, EntityRef>,
>({
	customers,
	entities,
	features,
	plans,
	schedules,
}: {
	customers: Customers;
	entities: Entities;
	features: Features;
	plans: Plans;
	schedules: Schedules;
}) =>
	({
		customers: refIds(customers),
		features: refIds(features),
		plans: refIds(plans),
		schedules: refIds(schedules),
		entities: refIds(entities),
	}) as unknown as EvalSetupIds<
		Features,
		Plans,
		Customers,
		Schedules,
		Entities
	>;

/**
 * Compose a mock Autumn org for evals from keyed feature, plan, and customer refs.
 * The returned arrays feed the mock API; refs keep setup assertions readable.
 */
export const createSetup = <
	Features extends Record<string, ApiFeatureV1>,
	Plans extends Record<string, PlanRef>,
	Customers extends Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Schedules extends Record<string, ScheduleRef> = Record<string, never>,
	Entities extends Record<string, EntityRef> = Record<string, never>,
>({
	agentRules: createAgentRules = ({ agentRules }) => agentRules.base(),
	customers: createCustomers,
	entities: createEntities,
	features: createFeatures,
	plans: createPlans,
	schedules: createSchedules,
	tag,
}: {
	tag: string;
	agentRules?: ({
		agentRules,
	}: {
		agentRules: typeof agentRulesFixture;
	}) => AgentRules;
	features: ({
		featureList,
		features,
	}: {
		featureList: typeof featureListFixture;
		features: typeof featureFixtures;
	}) => Features;
	plans: ({
		basePrice,
		features,
		itemList,
		items,
		plan,
		planList,
	}: {
		basePrice: typeof basePriceFixture;
		features: Features;
		itemList: typeof itemListFixture;
		items: typeof itemFixtures;
		plan: typeof planFixture;
		planList: typeof planListFixture;
	}) => Plans;
	customers: ({
		balances,
		customerList,
		customers,
		features,
		plans,
		subscriptions,
	}: {
		balances: typeof balanceFixtures;
		customerList: typeof customerListFixture;
		customers: typeof customerFixtures;
		features: Features;
		plans: Plans;
		subscriptions: typeof subscriptionFixtures;
	}) => Customers;
	schedules?: ({
		customers,
		plans,
		schedules,
	}: {
		customers: Customers;
		plans: Plans;
		schedules: typeof scheduleFixtures;
	}) => Schedules;
	entities?: ({
		customers,
		entities,
		features,
	}: {
		customers: Customers;
		entities: typeof entityFixtures;
		features: Features;
	}) => Entities;
}): EvalSetup<Features, Plans, Customers, Schedules, Entities> => {
	const agentRuleRefs = createAgentRules({
		agentRules: agentRulesFixture,
	});
	const featureRefs = createFeatures({
		featureList: featureListFixture,
		features: featureFixtures,
	});
	const planRefs = createPlans({
		basePrice: basePriceFixture,
		features: featureRefs,
		itemList: itemListFixture,
		items: itemFixtures,
		plan: planFixture,
		planList: planListFixture,
	});
	const customerRefs = createCustomers({
		balances: balanceFixtures,
		customerList: customerListFixture,
		customers: customerFixtures,
		features: featureRefs,
		plans: planRefs,
		subscriptions: subscriptionFixtures,
	});
	const scheduleRefs = createSchedules?.({
		customers: customerRefs,
		plans: planRefs,
		schedules: scheduleFixtures,
	});
	const entityRefs =
		createEntities?.({
			customers: customerRefs,
			entities: entityFixtures,
			features: featureRefs,
		}) ?? ({} as Entities);

	return {
		tag,
		ids: setupIds({
			customers: customerRefs,
			entities: entityRefs,
			features: featureRefs,
			plans: planRefs,
			schedules: (scheduleRefs ?? {}) as Schedules,
		}),
		agentRules: agentRuleRefs,
		features: Object.values(featureRefs),
		plans: flattenRecordValues<ApiPlanV1>(planRefs),
		customers: flattenRecordValues<BaseApiCustomerV5>(customerRefs),
		schedules: flattenRecordValues<ApiCustomerSchedule>(
			(scheduleRefs ?? {}) as Schedules,
		),
		entities: flattenRecordValues<ApiEntityV2>(entityRefs),
		refs: {
			agentRules: agentRuleRefs,
			features: featureRefs,
			plans: planRefs,
			customers: customerRefs,
			schedules: (scheduleRefs ?? {}) as Schedules,
			entities: entityRefs,
		},
	};
};

/** Extend an org setup with eval-specific customers while preserving typed refs. */
export const withCustomers = <
	Setup extends EvalSetup,
	Customers extends Record<string, BaseApiCustomerV5 | BaseApiCustomerV5[]>,
	Entities extends Record<string, EntityRef> = Record<string, never>,
>({
	customers: createCustomers,
	entities: createEntities,
	setup,
}: {
	setup: Setup;
	customers: ({
		balances,
		customerList,
		customers,
		features,
		plans,
		subscriptions,
	}: {
		balances: typeof balanceFixtures;
		customerList: typeof customerListFixture;
		customers: typeof customerFixtures;
		features: Setup["refs"]["features"];
		plans: Setup["refs"]["plans"];
		subscriptions: typeof subscriptionFixtures;
	}) => Customers;
	entities?: ({
		customers,
		entities,
		features,
	}: {
		customers: Customers;
		entities: typeof entityFixtures;
		features: Setup["refs"]["features"];
	}) => Entities;
}): EvalSetup<
	Setup["refs"]["features"],
	Setup["refs"]["plans"],
	Customers,
	Setup["refs"]["schedules"],
	Setup["refs"]["entities"] & Entities
> => {
	const customerRefs = createCustomers({
		balances: balanceFixtures,
		customerList: customerListFixture,
		customers: customerFixtures,
		features: setup.refs.features,
		plans: setup.refs.plans,
		subscriptions: subscriptionFixtures,
	});
	const entityRefs =
		createEntities?.({
			customers: customerRefs,
			entities: entityFixtures,
			features: setup.refs.features,
		}) ?? ({} as Entities);
	const allEntityRefs = {
		...setup.refs.entities,
		...entityRefs,
	} as Setup["refs"]["entities"] & Entities;

	return {
		...setup,
		ids: setupIds({
			customers: customerRefs,
			entities: allEntityRefs,
			features: setup.refs.features,
			plans: setup.refs.plans,
			schedules: setup.refs.schedules,
		}),
		customers: [
			...setup.customers,
			...flattenRecordValues<BaseApiCustomerV5>(customerRefs),
		],
		entities: [
			...setup.entities,
			...flattenRecordValues<ApiEntityV2>(entityRefs),
		],
		refs: {
			...setup.refs,
			customers: customerRefs,
			entities: allEntityRefs,
		},
	};
};
