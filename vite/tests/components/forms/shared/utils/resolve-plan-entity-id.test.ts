import { describe, expect, test } from "bun:test";
import { resolvePlanEntityId } from "@/components/forms/shared/utils/resolvePlanEntityId";

describe("resolvePlanEntityId", () => {
	test("inherits the default when the plan scope is undefined", () => {
		expect(
			resolvePlanEntityId({
				planEntityId: undefined,
				defaultEntityId: "entity-default",
			}),
		).toBe("entity-default");
	});

	test("uses an explicit plan entity", () => {
		expect(
			resolvePlanEntityId({
				planEntityId: "entity-plan",
				defaultEntityId: "entity-default",
			}),
		).toBe("entity-plan");
	});

	test("clears the default for a customer-level plan", () => {
		expect(
			resolvePlanEntityId({
				planEntityId: null,
				defaultEntityId: "entity-default",
			}),
		).toBeUndefined();
	});
});
