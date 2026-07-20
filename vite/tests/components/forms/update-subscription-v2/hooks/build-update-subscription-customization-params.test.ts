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
				licenseQuantities: {},
				initialLicenseQuantities: {},
			}),
		).toEqual({
			items: undefined,
			license_quantities: undefined,
			upsert_licenses: addLicenses,
		});
	});

	test("omits untouched license patches", () => {
		expect(
			buildUpdateSubscriptionCustomizationParams({
				items: null,
				addLicenses: null,
				licenseQuantities: { team_seat: 2 },
				initialLicenseQuantities: { team_seat: 2 },
			}),
		).toEqual({
			items: undefined,
			license_quantities: undefined,
			upsert_licenses: undefined,
		});
	});

	test("serializes only changed license seat totals", () => {
		expect(
			buildUpdateSubscriptionCustomizationParams({
				items: null,
				addLicenses: null,
				licenseQuantities: { team_seat: 4, support_seat: 1 },
				initialLicenseQuantities: { team_seat: 2, support_seat: 1 },
			}),
		).toEqual({
			items: undefined,
			license_quantities: [{ license_plan_id: "team_seat", quantity: 4 }],
			upsert_licenses: undefined,
		});
	});
});
