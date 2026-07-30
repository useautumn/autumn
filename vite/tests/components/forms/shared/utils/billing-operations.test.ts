import { describe, expect, test } from "bun:test";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

describe("BILLING_OPERATIONS", () => {
	test("keeps each payload paired with its routes and invalidation behavior", () => {
		expect(BILLING_OPERATIONS).toEqual({
			attach: {
				path: "/v1/billing.attach",
				previewPath: "/v1/billing.preview_attach",
				invalidatesSchedule: false,
			},
			createSchedule: {
				path: "/v1/billing.create_schedule",
				previewPath: "/v1/billing.preview_create_schedule",
				invalidatesSchedule: true,
			},
		});
	});
});
