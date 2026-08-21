import { describe, expect, test } from "bun:test";
import { BillingInterval, BillingMethod } from "@autumn/shared";
import { checkUpdatePlanOpEligibility } from "@/internal/migrations/v2/batchOperations/compute/guards/checkUpdatePlanOpEligibility.js";

describe("checkUpdatePlanOpEligibility", () => {
	test("version-only with no add_items or remove_items is not batch-lowered", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				version: 2,
			},
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_version_only",
		);
	});

	test("version plus add_items is not rejected as version-only", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				version: 2,
				customize: { add_items: [{ feature_id: "dashboard" }] },
			},
		});

		expect(rejections.map((rejection) => rejection.code)).not.toContain(
			"unsupported_version_only",
		);
	});

	test("version plus remove_items is not rejected as version-only", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				version: 2,
				customize: { remove_items: [{ feature_id: "dashboard" }] },
			},
		});

		expect(rejections.map((rejection) => rejection.code)).not.toContain(
			"unsupported_version_only",
		);
	});

	test("upsert_licenses with free add_items is batch-lowered", () => {
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

		expect(rejections).toEqual([]);
	});

	test("upsert_licenses without item changes is not batch-lowered", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "team" },
				customize: {
					upsert_licenses: [{ license_plan_id: "seat", customize: {} }],
				},
			},
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"unsupported_upsert_licenses",
		);
	});

	test("upsert_licenses link fields are not batch-lowered", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "team" },
				customize: {
					upsert_licenses: [
						{
							license_plan_id: "seat",
							included: 5,
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

	test("upsert_licenses priced add_items are not batch-lowered", () => {
		const rejections = checkUpdatePlanOpEligibility({
			opIndex: 0,
			op: {
				type: "update_plan",
				plan_filter: { plan_id: "team" },
				customize: {
					upsert_licenses: [
						{
							license_plan_id: "seat",
							customize: {
								add_items: [
									{
										feature_id: "dashboard",
										price: {
											amount: 5,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
										},
									},
								],
							},
						},
					],
				},
			},
		});

		expect(rejections.map((rejection) => rejection.code)).toContain(
			"priced_add_item",
		);
	});
});
