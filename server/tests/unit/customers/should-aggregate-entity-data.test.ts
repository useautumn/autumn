import { describe, expect, test } from "bun:test";
import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import { shouldAggregateEntityData } from "@/internal/customers/cusUtils/customerEntityData.js";

describe("shouldAggregateEntityData", () => {
	test("is on for V2.3 and earlier", () => {
		expect(
			shouldAggregateEntityData({
				apiVersion: new ApiVersionClass(ApiVersion.V2_3),
			}),
		).toBe(true);
		expect(
			shouldAggregateEntityData({
				apiVersion: new ApiVersionClass(ApiVersion.V2_2),
			}),
		).toBe(true);
	});

	test("is off for V2.4", () => {
		expect(
			shouldAggregateEntityData({
				apiVersion: new ApiVersionClass(ApiVersion.V2_4),
			}),
		).toBe(false);
	});

	test("keeps aggregating when apiVersion is missing", () => {
		expect(shouldAggregateEntityData({})).toBe(true);
	});
});
