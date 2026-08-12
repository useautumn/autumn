import type { Operations } from "@autumn/shared";
import type { ItemSpec, MigrationScenario } from "./migrationScenarioTypes";

const toPlanItem = (item: ItemSpec) => ({
	feature_id: item.featureId,
	...(item.boolean ? {} : {}),
	...(item.unlimited ? { unlimited: true } : {}),
	...(item.included !== undefined ? { included: item.included } : {}),
	...(item.interval
		? {
				reset: {
					interval: item.interval,
					...(item.intervalCount ? { interval_count: item.intervalCount } : {}),
				},
			}
		: {}),
	...(item.priced
		? {
				price: {
					amount: item.priced.amount,
					billing_units: item.priced.billingUnits,
				},
			}
		: {}),
	...(item.entityFeatureId ? { entity_feature_id: item.entityFeatureId } : {}),
	...(item.pooled ? { pooled: true } : {}),
	...(item.rollover ? { rollover: { max: item.rollover.max } } : {}),
});

const toRemoveFilter = (item: ItemSpec) => ({
	feature_id: item.featureId,
	...(item.interval
		? {
				interval: item.interval,
				interval_count: item.intervalCount ?? 1,
			}
		: {}),
});

const customizeFor = (scenario: MigrationScenario) => {
	const { op } = scenario;
	if (op.verb === "add") return { add_items: [toPlanItem(op.item)] };
	if (op.verb === "remove") return { remove_items: [toRemoveFilter(op.item)] };
	return {
		add_items: [toPlanItem(op.to)],
		remove_items: [toRemoveFilter(op.from)],
	};
};

/** Turns a scenario into the operation the migration runs, targeting either the
 * plan the customer holds or a license plan its parent links. */
export const buildScenarioOperations = ({
	scenario,
	planId,
	licensePlanId,
}: {
	scenario: MigrationScenario;
	planId: string;
	licensePlanId?: string;
}): Operations => {
	const customize = customizeFor(scenario);
	const planFilter = { plan_id: planId, custom: false };

	if (scenario.op.target === "plan") {
		return {
			customer: [{ type: "update_plan", plan_filter: planFilter, customize }],
		} as Operations;
	}

	if (!licensePlanId) {
		throw new Error(
			`Scenario ${scenario.name} targets a license but none was seeded`,
		);
	}

	return {
		customer: [
			{
				type: "update_plan",
				plan_filter: planFilter,
				customize: {
					upsert_licenses: [{ license_plan_id: licensePlanId, customize }],
				},
			},
		],
	} as Operations;
};
