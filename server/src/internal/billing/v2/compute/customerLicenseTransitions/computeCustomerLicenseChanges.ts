import type {
	AutumnBillingPlan,
	CustomerLicenseBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import { computeCustomerLicenseReleases } from "./computeCustomerLicenseReleases.js";
import { computeCustomerLicenseTransitions } from "./computeCustomerLicenseTransitions.js";

export const computeCustomerLicenseChanges = ({
	outgoingCustomerProduct,
	incomingCustomerProduct,
	customerLicenseBillingContext,
	carryCustomerLicenseState = true,
	releasedAt,
}: {
	outgoingCustomerProduct: FullCusProduct;
	incomingCustomerProduct: FullCusProduct;
	customerLicenseBillingContext?: CustomerLicenseBillingContext;
	carryCustomerLicenseState?: boolean;
	releasedAt: number;
}): Pick<
	AutumnBillingPlan,
	"customerLicenseTransitions" | "releaseCustomerLicenseAssignments"
> => ({
	customerLicenseTransitions: computeCustomerLicenseTransitions({
		outgoingCustomerProducts: [outgoingCustomerProduct],
		incomingCustomerProducts: [incomingCustomerProduct],
		customerLicenseBillingContext,
		carryCustomerLicenseState,
	}),
	releaseCustomerLicenseAssignments: computeCustomerLicenseReleases({
		outgoingCustomerProduct,
		incomingCustomerProduct,
		releasedAt,
	}),
});
