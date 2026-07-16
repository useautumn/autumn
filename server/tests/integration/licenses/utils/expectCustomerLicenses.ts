import { expect } from "bun:test";
import type { ApiCustomerLicenseV0, ApiCustomerV5 } from "@autumn/shared";

type LicenseExpectation = Partial<ApiCustomerLicenseV0> &
	Pick<ApiCustomerLicenseV0, "license_plan_id">;

/**
 * Asserts the customer's `licenses` array: one entry per expectation, matched
 * by license_plan_id (+ parent_plan_id when given); only specified fields are
 * checked. Pass `count` to also pin the total number of license rows.
 */
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

	if (typeof count !== "undefined") {
		expect(customer.licenses.length).toBe(count);
	}

	for (const expectation of licenses) {
		const match = customer.licenses.find(
			(license) =>
				license.license_plan_id === expectation.license_plan_id &&
				(expectation.parent_plan_id === undefined ||
					license.parent_plan_id === expectation.parent_plan_id),
		);

		expect(
			match,
			`Missing license ${expectation.license_plan_id}: ${JSON.stringify(customer.licenses)}`,
		).toBeDefined();
		expect(match).toMatchObject(expectation);
	}
};
