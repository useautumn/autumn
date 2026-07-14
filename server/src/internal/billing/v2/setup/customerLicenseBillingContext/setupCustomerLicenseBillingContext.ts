import {
	type CustomerLicenseBillingContext,
	type FullCustomer,
	fullCustomerToCustomerLicenses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";

/**
 * Loads the customer's license billing state once, so every compute stays
 * pure. Action-agnostic: derives its inputs from the hydrated customer;
 * customers with no licenses pay no query.
 */
export const setupCustomerLicenseBillingContext = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<CustomerLicenseBillingContext> => {
	const customerLicenses = fullCustomerToCustomerLicenses({ fullCustomer });
	if (customerLicenses.length === 0) return { licenseBillingPriceRows: [] };

	const licenseBillingPriceRows =
		await customerLicenseRepo.listBillingPriceRows({
			db: ctx.db,
			customerLicenses,
		});

	return { licenseBillingPriceRows };
};
