import { expect, test } from "bun:test";
import type { Operations } from "@autumn/shared";
import { hasActiveFilter } from "./FilterStep";
import { toOperationsPayload } from "./useMigrationEditorForm";

// `hasActiveFilter` gates the customer preview. It must recognize the
// customer-level `$and`/`$or` shapes — not just the legacy single `plan` — or
// multi-condition filters silently render no preview.
test("hasActiveFilter is false for an empty or default-only filter", () => {
	expect(hasActiveFilter({})).toBe(false);
	expect(hasActiveFilter({ plan: { plan_id: "" } })).toBe(false);
});

test("hasActiveFilter is true for a single plan / customer_id condition", () => {
	expect(hasActiveFilter({ plan: { plan_id: "free" } })).toBe(true);
	expect(hasActiveFilter({ customer_id: "cus_1" })).toBe(true);
});

test("hasActiveFilter is true for $and / $or compositions", () => {
	expect(
		hasActiveFilter({
			$and: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
		}),
	).toBe(true);
	expect(
		hasActiveFilter({
			$or: [{ plan: { plan_id: "free" } }, { plan: { plan_id: "pro" } }],
		}),
	).toBe(true);
});

// A filter-only draft (no operations yet) must persist: an empty operations
// block is sent as null, since the `{}` shape fails the server's resource-block
// check. A non-empty (even mid-edit) block is kept so editing isn't lost.
const op = {
	type: "add_plan",
	plan_filter: { plan_id: "pro" },
	plan_id: "pro",
} as unknown as NonNullable<Operations["customer"]>[number];

test("toOperationsPayload sends an empty operations block as null", () => {
	expect(toOperationsPayload({})).toBeNull();
	expect(toOperationsPayload({ customer: [] })).toBeNull();
});

test("toOperationsPayload keeps a non-empty operations block", () => {
	const operations: Operations = { customer: [op] };
	expect(toOperationsPayload(operations)).toBe(operations);
});
