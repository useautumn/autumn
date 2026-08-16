import { describe, expect, test } from "bun:test";
import { checkUpdatePlanOpEligibility } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanOpEligibility.js";

describe("checkUpdatePlanOpEligibility", () => {
	test("upsert_licenses is not batch-lowered", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "team" },
				customize: {
					upsert_licenses: [
						{
							license_plan_id: "seat",
							customize: { add_items: [{ feature_id: "dashboard" }] },
						},
					],
				},
			},
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_upsert_licenses",
		);
	});
});
