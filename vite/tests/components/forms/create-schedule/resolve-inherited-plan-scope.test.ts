import { describe, expect, test } from "bun:test";
import { AppEnv, type ProductV2 } from "@autumn/shared";
import { EMPTY_SCHEDULE_PLAN } from "@/components/forms/create-schedule/createScheduleFormSchema";
import { resolveInheritedPlanScope } from "@/components/forms/create-schedule/scheduleUtils";

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

describe("resolveInheritedPlanScope", () => {
	test("inherits the opening plan's entity for the same group", () => {
		expect(
			resolveInheritedPlanScope({
				productId: "enterprise",
				openingPhasePlans: [plan({ productId: "pro", entityId: "ent_1" })],
				products,
			}),
		).toBe("ent_1");
	});

	test("an explicit customer-level opening plan stays customer-level", () => {
		expect(
			resolveInheritedPlanScope({
				productId: "enterprise",
				openingPhasePlans: [plan({ productId: "pro", entityId: null })],
				products,
			}),
		).toBeUndefined();
	});

	test("an opening plan with no choice is customer-level", () => {
		expect(
			resolveInheritedPlanScope({
				productId: "enterprise",
				openingPhasePlans: [plan({ productId: "pro", entityId: undefined })],
				products,
			}),
		).toBeUndefined();
	});

	test("a group absent from the opening phase is customer-level", () => {
		expect(
			resolveInheritedPlanScope({
				productId: "seats",
				openingPhasePlans: [plan({ productId: "pro", entityId: "ent_1" })],
				products,
			}),
		).toBeUndefined();
	});

	test("tracks the opening plan after its scope changes", () => {
		const openingPhasePlans = [plan({ productId: "pro", entityId: "ent_1" })];
		expect(
			resolveInheritedPlanScope({
				productId: "enterprise",
				openingPhasePlans,
				products,
			}),
		).toBe("ent_1");

		expect(
			resolveInheritedPlanScope({
				productId: "enterprise",
				openingPhasePlans: [plan({ productId: "pro", entityId: "ent_2" })],
				products,
			}),
		).toBe("ent_2");
	});
});
