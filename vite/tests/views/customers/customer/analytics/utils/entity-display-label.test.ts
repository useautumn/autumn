import { expect, test } from "bun:test";
import { entityDisplayLabel } from "@/views/customers/customer/analytics/utils/entityDisplayLabel";

const entityNames = {
	named: { name: "Seat 1", internal_customer_id: "int_cus_1" },
	unnamed: { name: null, internal_customer_id: "int_cus_2" },
	blankName: { name: "", internal_customer_id: "int_cus_3" },
};

test("prefers the entity name", () => {
	expect(entityDisplayLabel({ entityId: "named", entityNames })).toBe("Seat 1");
});

test("falls back to the id when the name is missing or empty", () => {
	expect(entityDisplayLabel({ entityId: "unnamed", entityNames })).toBe(
		"unnamed",
	);
	expect(entityDisplayLabel({ entityId: "blankName", entityNames })).toBe(
		"blankName",
	);
});

test("falls back to the id when the entity is unknown", () => {
	expect(entityDisplayLabel({ entityId: "missing", entityNames })).toBe(
		"missing",
	);
	expect(entityDisplayLabel({ entityId: "ent_1" })).toBe("ent_1");
});
