import {
	type FullCustomer,
	fullCustomerToCustomerLicenses,
	fullCustomerToLicenseParentCustomerProducts,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { countActiveByCustomerLicenseLinkIds } from "../../repos/customerLicenseRepo/countActiveByCustomerLicenseLinkIds.js";
import { listAdoptableStrandedCustomerLicenses } from "../../repos/customerLicenseRepo/listAdoptableStrandedCustomerLicenses.js";
import type { ReconcileContext } from "./types.js";

/**
 * Gathers everything reconcile needs. Parents and customer licenses come
 * straight off the FullCustomer (live parents only); stranded rows and seat
 * counts are the only DB reads, both bounded by customer license count.
 */
export const setupReconcileContext = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<ReconcileContext> => {
	const parentCustomerProducts = fullCustomerToLicenseParentCustomerProducts({
		fullCustomer,
	});
	const customerLicenses = fullCustomerToCustomerLicenses({ fullCustomer });

	const strandedCustomerLicenses = await listAdoptableStrandedCustomerLicenses({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		liveParentStartTimes: parentCustomerProducts.map(
			(parent) => parent.starts_at,
		),
	});

	const allCustomerLicenses = [
		...customerLicenses,
		...strandedCustomerLicenses.map(({ customerLicense }) => customerLicense),
	];
	const seatCountByLinkId = await countActiveByCustomerLicenseLinkIds({
		db: ctx.db,
		customerLicenseLinkIds: allCustomerLicenses.map(
			(customerLicense) => customerLicense.link_id,
		),
	});
	// Seats anchor by link; downstream still keys by row id.
	const seatCountByCustomerLicenseId = new Map(
		allCustomerLicenses.map((customerLicense) => [
			customerLicense.id,
			seatCountByLinkId.get(customerLicense.link_id) ?? 0,
		]),
	);

	return {
		fullCustomer,
		parentCustomerProducts,
		customerLicenses,
		strandedCustomerLicenses,
		seatCountByCustomerLicenseId,
	};
};
