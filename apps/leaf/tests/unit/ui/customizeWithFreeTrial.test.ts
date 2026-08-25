/**
 * A trial is documented at the top level of a billing request and defined
 * inside `customize`. The server honours both, so an approval card built from
 * the raw request must fold the shorthand too — otherwise a trialling attach
 * renders with no trial line, which is what shipped to Slack on 2026-08-25.
 */

import { describe, expect, test } from "bun:test";
import { buildCustomizeChanges, customizeWithFreeTrial } from "@autumn/render";

const trial = {
	card_required: true,
	duration_length: 14,
	duration_type: "day",
};

const trialChanges = (request: unknown) =>
	buildCustomizeChanges({
		currentPlan: null,
		customize: customizeWithFreeTrial(request),
	}).filter((change) => change.subject === "free_trial");

describe("customizeWithFreeTrial", () => {
	test("a top-level free_trial renders as a trial change", () => {
		expect(trialChanges({ plan_id: "scale", free_trial: trial })).toHaveLength(
			1,
		);
	});

	test("customize.free_trial still renders, and wins when both are given", () => {
		const changes = trialChanges({
			plan_id: "scale",
			free_trial: { ...trial, duration_length: 30 },
			customize: { free_trial: trial },
		});
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ trial });
	});

	test("a request with no trial renders no trial change", () => {
		expect(trialChanges({ plan_id: "scale" })).toHaveLength(0);
	});

	test("other customize fields are preserved alongside the shorthand", () => {
		const folded = customizeWithFreeTrial({
			free_trial: trial,
			customize: { price: { amount: 500, interval: "month" } },
		}) as Record<string, unknown>;
		expect(folded.price).toEqual({ amount: 500, interval: "month" });
		expect(folded.free_trial).toEqual(trial);
	});
});
