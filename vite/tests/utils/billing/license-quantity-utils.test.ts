import { describe, expect, test } from "bun:test";
import type { FullCustomerLicense } from "@autumn/shared";
import { customerLicensesToQuantityTotals } from "@/utils/billing/licenseQuantityUtils";

describe("customerLicensesToQuantityTotals", () => {
	test("uses current granted totals keyed by license plan id", () => {
		const customerLicenses = [
			{
				granted: 3,
				planLicense: { product: { id: "team_seat" } },
			},
			{ granted: 2, planLicense: null },
		] as FullCustomerLicense[];

		expect(customerLicensesToQuantityTotals({ customerLicenses })).toEqual({
			team_seat: 3,
		});
	});
});
