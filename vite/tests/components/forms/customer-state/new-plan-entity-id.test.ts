import { describe, expect, test } from "bun:test";
import {
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { newPlanEntityId } from "@/components/forms/customer-state/utils/newPlanEntityId";

const planFor = (entityId: string | null): CustomerStatePlan => ({
	...EMPTY_CUSTOMER_STATE_PLAN,
	productId: "enterprise",
	entityId,
});

describe("newPlanEntityId", () => {
	test("a new plan inherits the entity of the phase it follows", () => {
		expect(
			newPlanEntityId({
				lastSelectedEntityId: undefined,
				phasePlans: [planFor("entity_1")],
			}),
		).toBe("entity_1");
	});

	test("an entity picked in this editor wins, customer-level included", () => {
		expect(
			newPlanEntityId({
				lastSelectedEntityId: "entity_2",
				phasePlans: [planFor("entity_1")],
			}),
		).toBe("entity_2");
		expect(
			newPlanEntityId({
				lastSelectedEntityId: null,
				phasePlans: [planFor("entity_1")],
			}),
		).toBeNull();
	});

	test("an empty row lends no entity, so a plan with nothing before it is customer-level", () => {
		expect(
			newPlanEntityId({
				lastSelectedEntityId: undefined,
				phasePlans: [planFor("entity_1"), EMPTY_CUSTOMER_STATE_PLAN],
			}),
		).toBe("entity_1");
		expect(
			newPlanEntityId({ lastSelectedEntityId: undefined, phasePlans: [] }),
		).toBeNull();
	});
});
