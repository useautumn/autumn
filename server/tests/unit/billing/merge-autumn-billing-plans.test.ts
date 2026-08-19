import { describe, expect, test } from "bun:test";
import type { AutumnBillingPlan } from "@autumn/shared";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans.js";

const emptyPlan = ({
	customerId = "cus_1",
}: {
	customerId?: string;
} = {}): AutumnBillingPlan => ({
	customerId,
	insertCustomerProducts: [],
});

describe("mergeAutumnBillingPlans", () => {
	test("keeps insertPlanLicenses and customerLicenseTransitions from incoming", () => {
		const incoming = {
			...emptyPlan(),
			insertPlanLicenses: [
				{
					row: { id: "plan_lic_1" },
					customPrices: [],
					customEntitlements: [],
					items: [],
				},
			],
			customerLicenseTransitions: [
				{
					outgoingCustomerLicense: { id: "cl_1" },
					incomingCustomerLicense: { id: "cl_1" },
					updates: {
						linkId: "link_1",
						granted: 2,
						remaining: 2,
						paidQuantity: 1,
					},
				},
			],
		} as unknown as AutumnBillingPlan;

		const merged = mergeAutumnBillingPlans({
			base: emptyPlan(),
			incoming,
		});

		expect(merged.insertPlanLicenses?.map((spec) => spec.row.id)).toEqual([
			"plan_lic_1",
		]);
		expect(
			merged.customerLicenseTransitions?.map(
				(transition) => transition.incomingCustomerLicense.id,
			),
		).toEqual(["cl_1"]);
	});
});
