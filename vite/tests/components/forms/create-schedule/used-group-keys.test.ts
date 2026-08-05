import { AppEnv, type ProductV2 } from "@autumn/shared";
import { describe, expect, test } from "bun:test";
import { EMPTY_SCHEDULE_PLAN } from "@/components/forms/create-schedule/createScheduleFormSchema";
import {
	getUnscheduledUsedGroupKeys,
	getUsedGroupKeys,
} from "@/components/forms/create-schedule/scheduleUtils";

function makeProduct({
	id,
	group = null,
	isAddOn = false,
}: {
	id: string;
	group?: string | null;
	isAddOn?: boolean;
}): ProductV2 {
	return {
		id,
		name: id,
		is_add_on: isAddOn,
		is_default: false,
		version: 1,
		group,
		env: AppEnv.Sandbox,
		items: [],
		created_at: Date.now(),
	};
}

const products = [
	makeProduct({ id: "pro", group: "main" }),
	makeProduct({ id: "enterprise", group: "main" }),
	makeProduct({ id: "seats", isAddOn: true }),
];

const plan = ({
	productId,
	entityId,
}: {
	productId: string;
	entityId?: string | null;
}) => ({ ...EMPTY_SCHEDULE_PLAN, productId, entityId });

describe("getUsedGroupKeys", () => {
	test("an entity-scoped plan does not block the same group at customer level", () => {
		const keys = getUsedGroupKeys({
			plans: [plan({ productId: "enterprise", entityId: "ent_1" })],
			products,
		});

		expect(keys.size).toBe(0);
	});

	test("a customer-level plan blocks the same group at customer level", () => {
		const keys = getUsedGroupKeys({
			plans: [plan({ productId: "pro", entityId: null })],
			products,
		});

		expect(keys.size).toBe(1);
	});

	test("scopes to the requested entity", () => {
		const plans = [
			plan({ productId: "pro", entityId: null }),
			plan({ productId: "enterprise", entityId: "ent_1" }),
		];

		expect(getUsedGroupKeys({ plans, products, entityId: "ent_1" }).size).toBe(1);
		expect(getUsedGroupKeys({ plans, products, entityId: "ent_2" }).size).toBe(0);
	});

	test("excludes the plan being edited", () => {
		const keys = getUsedGroupKeys({
			plans: [plan({ productId: "pro", entityId: null })],
			products,
			excludePlanIndex: 0,
		});

		expect(keys.size).toBe(0);
	});
});

describe("getUnscheduledUsedGroupKeys", () => {
	const phase = (plans: ReturnType<typeof plan>[]) => ({
		startsAt: null,
		plans,
	});

	test("a later phase blocks the group it inherits at customer level", () => {
		const keys = getUnscheduledUsedGroupKeys({
			phases: [
				phase([plan({ productId: "pro", entityId: null })]),
				phase([plan({ productId: "enterprise" })]),
			],
			unscheduledPlans: [],
			planIndex: 0,
			products,
			entityId: null,
		});

		expect(keys.size).toBe(1);
	});

	test("a phase in another scope leaves the group free", () => {
		const keys = getUnscheduledUsedGroupKeys({
			phases: [phase([plan({ productId: "pro", entityId: null })])],
			unscheduledPlans: [],
			planIndex: 0,
			products,
			entityId: "ent_1",
		});

		expect(keys.size).toBe(0);
	});

	test("other unscheduled plans block their own scope", () => {
		const keys = getUnscheduledUsedGroupKeys({
			phases: [phase([plan({ productId: "seats", entityId: null })])],
			unscheduledPlans: [
				plan({ productId: "pro", entityId: "ent_1" }),
				plan({ productId: "enterprise", entityId: "ent_1" }),
			],
			planIndex: 1,
			products,
			entityId: "ent_1",
		});

		expect(keys.size).toBe(1);
	});
});
