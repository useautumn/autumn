import { describe, expect, test } from "bun:test";
import type {
	FullCusProduct,
	FullCustomerLicense,
	FullPlanLicense,
	FullProduct,
} from "@autumn/shared";
import { setupCustomerLicenseQuantityContext } from "@/internal/billing/v2/setup/setupCustomerLicenseQuantityContext";

const planLicense = ({
	id,
	group,
	included,
}: {
	id: string;
	group: string;
	included: number;
}) =>
	({
		included,
		product: { id, group },
	}) as FullPlanLicense;

const customerLicense = ({
	planLicense,
	paidQuantity,
}: {
	planLicense: FullPlanLicense;
	paidQuantity: number;
}) =>
	({
		license_internal_product_id: planLicense.product.internal_id,
		paid_quantity: paidQuantity,
		planLicense,
	}) as FullCustomerLicense;

const setupContext = ({
	params = {},
	outgoingLicense,
	incomingLicenses,
}: {
	params?: {
		license_quantities?: { license_plan_id: string; quantity: number }[];
	};
	outgoingLicense: FullCustomerLicense;
	incomingLicenses: FullPlanLicense[];
}) =>
	setupCustomerLicenseQuantityContext({
		params,
		customerProduct: {
			customer_licenses: [outgoingLicense],
		} as FullCusProduct,
		fullProduct: { licenses: incomingLicenses } as FullProduct,
	});

describe("setupCustomerLicenseQuantityContext", () => {
	test("carries paid seats to an omitted 1:1 group successor", () => {
		const outgoingPlanLicense = planLicense({
			id: "seat_a",
			group: "team_seat",
			included: 0,
		});
		const incomingPlanLicense = planLicense({
			id: "seat_b",
			group: "team_seat",
			included: 1,
		});

		expect(
			setupContext({
				outgoingLicense: customerLicense({
					planLicense: outgoingPlanLicense,
					paidQuantity: 3,
				}),
				incomingLicenses: [incomingPlanLicense],
			}),
		).toEqual([{ licensePlanId: "seat_b", totalQuantity: 4 }]);
	});

	test("does not carry over an explicitly requested zero", () => {
		const outgoingPlanLicense = planLicense({
			id: "seat_a",
			group: "team_seat",
			included: 0,
		});
		const incomingPlanLicense = planLicense({
			id: "seat_b",
			group: "team_seat",
			included: 0,
		});

		expect(
			setupContext({
				params: {
					license_quantities: [{ license_plan_id: "seat_b", quantity: 0 }],
				},
				outgoingLicense: customerLicense({
					planLicense: outgoingPlanLicense,
					paidQuantity: 3,
				}),
				incomingLicenses: [incomingPlanLicense],
			}),
		).toEqual([{ licensePlanId: "seat_b", totalQuantity: 0 }]);
	});
});
