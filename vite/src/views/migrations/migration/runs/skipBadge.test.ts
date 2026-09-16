import { expect, test } from "bun:test";
import { skipBadgeSpec, skipReasonFromResponse } from "./skipBadge";

test("no_updates_needed reads as No Changes", () => {
	expect(
		skipBadgeSpec({ skipReason: "no_updates_needed", response: null }),
	).toEqual({
		label: "No Changes",
		noChanges: true,
	});
});

test("ineligible says so next to Skipped", () => {
	expect(skipBadgeSpec({ skipReason: "ineligible", response: null })).toEqual({
		label: "Skipped (ineligible)",
		noChanges: false,
	});
});

test("legacy rows without a reason fall back to the empty-preview heuristic", () => {
	expect(
		skipBadgeSpec({
			skipReason: null,
			response: {
				preview: { plan_changes: [], balance_changes: [], flag_changes: [] },
			},
		}).label,
	).toBe("No Changes");
	expect(skipBadgeSpec({ skipReason: null, response: null }).label).toBe(
		"Skipped",
	);
});

test("skip_reason is read from an event response when present", () => {
	expect(skipReasonFromResponse({ skip_reason: "ineligible" })).toBe(
		"ineligible",
	);
	expect(skipReasonFromResponse({ skipped: { reason: "x" } })).toBeNull();
	expect(skipReasonFromResponse(null)).toBeNull();
});
