import { describe, expect, test } from "bun:test";
import {
	type CustomerStatePhase,
	type CustomerStatePlan,
	EMPTY_CUSTOMER_STATE_PLAN,
} from "@/components/forms/customer-state/customerStateSchema";
import { derivePhasePlanChanges } from "@/components/forms/customer-state/utils/phasePlanStatus";

const makePlan = ({
	productId,
	entityId = null,
}: {
	productId: string;
	entityId?: string | null;
}): CustomerStatePlan => ({
	...EMPTY_CUSTOMER_STATE_PLAN,
	productId,
	entityId,
});

const makePhase = (plans: CustomerStatePlan[]): CustomerStatePhase => ({
	startsAt: null,
	plans,
});

describe("derivePhasePlanChanges", () => {
	test("first phase compares against the customer's existing plans", () => {
		const { statuses, endingPlans } = derivePhasePlanChanges({
			phases: [
				makePhase([
					makePlan({ productId: "pro" }),
					makePlan({ productId: "addon" }),
				]),
			],
			phaseIndex: 0,
			existingPlans: [
				makePlan({ productId: "pro" }),
				makePlan({ productId: "free" }),
			],
			ongoingPlans: [],
		});

		expect(statuses).toEqual(["kept", "starts"]);
		expect(endingPlans.map((plan) => plan.productId)).toEqual(["free"]);
	});

	test("later phases compare against the phase before, not existing plans", () => {
		const { statuses, endingPlans } = derivePhasePlanChanges({
			phases: [
				makePhase([makePlan({ productId: "pro" })]),
				makePhase([makePlan({ productId: "premium" })]),
			],
			phaseIndex: 1,
			existingPlans: [makePlan({ productId: "premium" })],
			ongoingPlans: [],
		});

		expect(statuses).toEqual(["starts"]);
		expect(endingPlans.map((plan) => plan.productId)).toEqual(["pro"]);
	});

	test("the same plan at a different entity scope starts and ends", () => {
		const { statuses, endingPlans } = derivePhasePlanChanges({
			phases: [makePhase([makePlan({ productId: "pro", entityId: "ent_2" })])],
			phaseIndex: 0,
			existingPlans: [makePlan({ productId: "pro", entityId: "ent_1" })],
			ongoingPlans: [],
		});

		expect(statuses).toEqual(["starts"]);
		expect(endingPlans).toEqual([
			makePlan({ productId: "pro", entityId: "ent_1" }),
		]);
	});

	test("undefined and null entity ids are both customer-level", () => {
		const { statuses, endingPlans } = derivePhasePlanChanges({
			phases: [
				makePhase([{ ...makePlan({ productId: "pro" }), entityId: undefined }]),
			],
			phaseIndex: 0,
			existingPlans: [makePlan({ productId: "pro", entityId: null })],
			ongoingPlans: [],
		});

		expect(statuses).toEqual(["kept"]);
		expect(endingPlans).toEqual([]);
	});

	test("unpicked rows have no status and never end anything", () => {
		const { statuses, endingPlans } = derivePhasePlanChanges({
			phases: [
				makePhase([makePlan({ productId: "pro" })]),
				makePhase([{ ...EMPTY_CUSTOMER_STATE_PLAN }]),
			],
			phaseIndex: 1,
			existingPlans: [],
			ongoingPlans: [],
		});

		expect(statuses).toEqual([null]);
		expect(endingPlans.map((plan) => plan.productId)).toEqual(["pro"]);
	});

	test("a plan moved to ongoing doesn't read as ending", () => {
		const { endingPlans } = derivePhasePlanChanges({
			phases: [makePhase([{ ...EMPTY_CUSTOMER_STATE_PLAN }])],
			phaseIndex: 0,
			existingPlans: [makePlan({ productId: "seats" })],
			ongoingPlans: [makePlan({ productId: "seats" })],
		});

		expect(endingPlans).toEqual([]);
	});

	test("duplicate baseline plans at one scope end once", () => {
		const { endingPlans } = derivePhasePlanChanges({
			phases: [makePhase([makePlan({ productId: "pro" })])],
			phaseIndex: 0,
			existingPlans: [
				makePlan({ productId: "addon" }),
				makePlan({ productId: "addon" }),
			],
			ongoingPlans: [],
		});

		expect(endingPlans).toEqual([makePlan({ productId: "addon" })]);
	});
});
