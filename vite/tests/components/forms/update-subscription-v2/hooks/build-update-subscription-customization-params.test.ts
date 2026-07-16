import { describe, expect, test } from "bun:test";
import type { CustomizePlanLicense } from "@autumn/shared";
import { buildUpdateSubscriptionCustomizationParams } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionRequestBody";

describe("buildUpdateSubscriptionCustomizationParams", () => {
	test("serializes staged license patches", () => {
		const addLicenses = [
			{
				license_plan_id: "dev-seat",
				customize: { price: { amount: 40, interval: "month" } },
			},
		] satisfies CustomizePlanLicense[];

		expect(
			buildUpdateSubscriptionCustomizationParams({
				items: null,
				addLicenses,
			}),
		).toEqual({ items: undefined, upsert_licenses: addLicenses });
	});

	test("omits untouched license patches", () => {
		expect(
			buildUpdateSubscriptionCustomizationParams({
				items: null,
				addLicenses: null,
			}),
		).toEqual({ items: undefined, upsert_licenses: undefined });
	});
});
