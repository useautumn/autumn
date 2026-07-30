import { describe, expect, test } from "bun:test";
import { getAttachBillingPath } from "@/components/forms/attach-v2/utils/attachBillingPath";

describe("getAttachBillingPath", () => {
	test.each([
		[false, false, "/v1/billing.attach"],
		[false, true, "/v1/billing.preview_attach"],
		[true, false, "/v1/billing.create_schedule"],
		[true, true, "/v1/billing.preview_create_schedule"],
	])("selects the billing route", (isMultiPlan, preview, expected) => {
		expect(getAttachBillingPath({ isMultiPlan, preview })).toBe(expected);
	});
});
