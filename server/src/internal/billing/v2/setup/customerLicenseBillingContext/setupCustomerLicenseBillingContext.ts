import {
	type CustomerLicenseBillingContext,
	type FullCustomer,
	fullCustomerToCustomerLicenses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { countActiveByCustomerLicenseLinkIds } from "@/internal/licenses/repos/customerLicenseRepo/countActiveByCustomerLicenseLinkIds";

/** Loads assigned-seat billing snapshots once for pure downstream computes. */
export const setupCustomerLicenseBillingContext = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<CustomerLicenseBillingContext> => {
	const customerLicenses = fullCustomerToCustomerLicenses({ fullCustomer });
	if (customerLicenses.length === 0) {
		return {
			licenseBillingPriceRows: [],
			assignedSeatCountByCustomerLicenseId: new Map(),
			projectedPlanLicenseIds: new Set(),
		};
	}

	const [licenseBillingPriceRows, assignedSeatCountByLinkId] =
		await Promise.all([
			customerLicenseRepo.listBillingPriceRows({
				db: ctx.db,
				customerLicenses,
			}),
			countActiveByCustomerLicenseLinkIds({
				db: ctx.db,
				customerLicenseLinkIds: customerLicenses.map(
					(customerLicense) => customerLicense.link_id,
				),
			}),
		]);
	const assignedSeatCountByCustomerLicenseId = new Map(
		customerLicenses.map((customerLicense) => [
			customerLicense.id,
			assignedSeatCountByLinkId.get(customerLicense.link_id) ?? 0,
		]),
	);

	return {
		licenseBillingPriceRows,
		assignedSeatCountByCustomerLicenseId,
		projectedPlanLicenseIds: new Set(),
	};
};
