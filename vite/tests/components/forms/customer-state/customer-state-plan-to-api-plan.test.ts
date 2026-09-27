import { expect, test } from "bun:test";
import { customerStatePlanToApiPlan } from "@/components/forms/customer-state/customerStatePlanToApiPlan";
import { EMPTY_CUSTOMER_STATE_PLAN } from "@/components/forms/customer-state/customerStateSchema";

test("sends staged license seats as license_quantities", () => {
	const apiPlan = customerStatePlanToApiPlan({
		plan: {
			...EMPTY_CUSTOMER_STATE_PLAN,
			productId: "pro",
			licenseQuantities: { seat: 3 },
		},
		products: [],
		features: [],
	});

	expect(apiPlan.license_quantities).toEqual([
		{ license_plan_id: "seat", quantity: 3 },
	]);
});

test("raises seats below a customized included amount", () => {
	const apiPlan = customerStatePlanToApiPlan({
		plan: {
			...EMPTY_CUSTOMER_STATE_PLAN,
			productId: "pro",
			addLicenses: [{ license_plan_id: "seat", included: 5 }],
			licenseQuantities: { seat: 2 },
		},
		products: [],
		features: [],
	});

	expect(apiPlan.license_quantities).toEqual([
		{ license_plan_id: "seat", quantity: 5 },
	]);
});

test("omits license_quantities when no seats are staged", () => {
	const apiPlan = customerStatePlanToApiPlan({
		plan: { ...EMPTY_CUSTOMER_STATE_PLAN, productId: "pro" },
		products: [],
		features: [],
	});

	expect(apiPlan).not.toHaveProperty("license_quantities");
});
