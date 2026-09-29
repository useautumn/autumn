import { expect } from "bun:test";
import type { ApiCustomerLicenseV0, ApiCustomerV5 } from "@autumn/shared";

type LicenseExpectation = Partial<ApiCustomerLicenseV0> &
	Pick<ApiCustomerLicenseV0, "license_plan_id">;

/** One entry per expectation, matched by license_plan_id (+ parent_plan_id
 * when given); only specified fields are checked. `count` pins the total. */
export const assertLicensesMatch = ({
	actual,
	licenses,
	count,
}: {
	actual: ApiCustomerLicenseV0[];
	licenses: LicenseExpectation[];
	count?: number;
}) => {
	if (typeof count !== "undefined") {
		expect(actual.length, JSON.stringify(actual)).toBe(count);
	}

	for (const expectation of licenses) {
		const match = actual.find(
			(license) =>
				license.license_plan_id === expectation.license_plan_id &&
				(expectation.parent_plan_id === undefined ||
					license.parent_plan_id === expectation.parent_plan_id),
		);

		expect(
			match,
			`Missing license ${expectation.license_plan_id}: ${JSON.stringify(actual)}`,
		).toBeDefined();
		expect(match).toMatchObject(expectation);
	}
};

/** Asserts the customer's `licenses` array (see assertLicensesMatch). */
export const expectCustomerLicenses = ({
	customer,
	licenses,
	count,
}: {
	customer: ApiCustomerV5;
	licenses: LicenseExpectation[];
	count?: number;
}) => {
	expect(customer.licenses).toBeDefined();
	assertLicensesMatch({ actual: customer.licenses, licenses, count });
};
