import { expect, test } from "bun:test";
import {
	type TooltipEntry,
	tooltipItemLink,
} from "@/views/customers/customer/analytics/components/tooltipItemLink";

const entryFor = (group: Partial<TooltipEntry>): TooltipEntry => ({
	dataKey: "messages_count__group",
	value: 5,
	color: "#9c5aff",
	...group,
});

test("links a customer series to its customer page", () => {
	expect(tooltipItemLink({ item: entryFor({ customerId: "cus_1" }) })).toEqual({
		path: "/customers/cus_1",
		preserveParams: false,
	});
});

test("links an entity series to its owner, scoped to the entity", () => {
	expect(
		tooltipItemLink({
			item: entryFor({ entityId: "ent_1", entityCustomerId: "int_cus_1" }),
		}),
	).toEqual({
		path: "/customers/int_cus_1",
		queryParams: { entity_id: "ent_1" },
	});
});

test("does not link a series with no customer or entity", () => {
	expect(tooltipItemLink({ item: entryFor({}) })).toBeUndefined();
});

test("does not link an entity whose owner never resolved", () => {
	expect(
		tooltipItemLink({ item: entryFor({ entityId: "ent_1" }) }),
	).toBeUndefined();
});
