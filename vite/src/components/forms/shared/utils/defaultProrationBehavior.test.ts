import { describe, expect, test } from "bun:test";
import { defaultProrationBehavior } from "./defaultProrationBehavior";

/** Attach's sheet and Set Plans' sheet open on the same proration: No charges on a live subscription, prorated on a new one. */
describe("defaultProrationBehavior", () => {
	test("a live subscription opens on No charges", () => {
		expect(defaultProrationBehavior({ noChargesAllowed: true })).toBe("none");
	});

	test("a new subscription or cycle opens on Prorated", () => {
		expect(defaultProrationBehavior({ noChargesAllowed: false })).toBe(
			"prorate_immediately",
		);
	});
});
