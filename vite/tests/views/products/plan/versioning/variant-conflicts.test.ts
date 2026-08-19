import { describe, expect, test } from "bun:test";
import { conflictSentence } from "@/views/products/plan/versioning/variantConflicts";

describe("conflictSentence", () => {
	test("names the license when the clash is on a seat slot", () => {
		expect(
			conflictSentence({
				reason: "value_divergence",
				feature_name: "Messages",
				license_plan_id: "qa-eus-seat",
			}),
		).toBe(
			"Messages on qa-eus-seat has a customized value that propagating would overwrite.",
		);
	});
});
