import type { FullCustomer, FullCustomerLicense } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getFullCustomerLicenses } from "../repos/customerLicenseRepo/getFullCustomerLicenses.js";

/**
 * Stitches the customer's licenses (hydrated with their effective plan
 * license) onto their parent customer products — a customer product carries
 * its customer_licenses the same way it carries customer_prices.
 */
export const hydrateFullCustomerLicenses = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<void> => {
	// getFullCustomerLicenses keys by public customer id; id-less customers
	// skip hydration.
	if (!fullCustomer.id) return;

	const customerLicenses = await getFullCustomerLicenses({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: fullCustomer.id,
	});

	const byParentId = new Map<string, FullCustomerLicense[]>();
	for (const customerLicense of customerLicenses) {
		const rows = byParentId.get(customerLicense.parent_customer_product_id);
		if (rows) rows.push(customerLicense);
		else
			byParentId.set(customerLicense.parent_customer_product_id, [
				customerLicense,
			]);
	}
	for (const customerProduct of fullCustomer.customer_products) {
		customerProduct.customer_licenses =
			byParentId.get(customerProduct.id) ?? [];
	}
};
