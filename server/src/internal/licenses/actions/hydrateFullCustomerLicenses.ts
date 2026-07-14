import type { FullCustomer, FullCustomerLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullCustomerLicenses } from "../repos/customerLicenseRepo/getFullCustomerLicenses.js";

/** Loads a customer's license pools hydrated with their effective plan
 * license and product. Customers with no pools pay one indexed read. */
export const hydrateFullCustomerLicenses = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<FullCustomerLicense[]> => {
	// getFullCustomerLicenses keys by public customer id; id-less customers
	// skip hydration.
	if (!fullCustomer.id) return [];

	return await getFullCustomerLicenses({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: fullCustomer.id,
	});
};
