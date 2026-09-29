import { describe, expect, test } from "bun:test";
import { BILLING_OPERATIONS } from "@/components/forms/shared/utils/billingOperations";

describe("BILLING_OPERATIONS", () => {
	test("keeps each payload paired with its routes", () => {
		expect(BILLING_OPERATIONS).toEqual({
			attach: {
				path: "/v1/billing.attach",
				previewPath: "/v1/billing.preview_attach",
			},
			updateSubscription: {
				path: "/v1/billing.update",
				previewPath: "/v1/billing.preview_update",
			},
			multiAttach: {
				path: "/v1/billing.multi_attach",
				previewPath: "/v1/billing.preview_multi_attach",
			},
			setPlans: {
				path: "/v1/billing.set_plans",
				previewPath: "/v1/billing.preview_set_plans",
			},
		});
	});
});
