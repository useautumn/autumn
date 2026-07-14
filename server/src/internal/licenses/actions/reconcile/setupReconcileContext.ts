import {
	type FullCustomer,
	fullCustomerToLicenseParentCustomerProducts,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { countActiveByCustomerLicenseIds } from "../../repos/customerLicenseRepo/countActiveByCustomerLicenseIds.js";
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
	const customerLicenses = fullCustomer.customer_licenses;

	const strandedCustomerLicenses = await listAdoptableStrandedCustomerLicenses({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		liveParentStartTimes: parentCustomerProducts.map(
			(parent) => parent.starts_at,
		),
	});

	const seatCountByCustomerLicenseId = await countActiveByCustomerLicenseIds({
		db: ctx.db,
		customerLicenseIds: [
			...customerLicenses.map((customerLicense) => customerLicense.id),
			...strandedCustomerLicenses.map(
				({ customerLicense }) => customerLicense.id,
			),
		],
	});

	return {
		fullCustomer,
		parentCustomerProducts,
		customerLicenses,
		strandedCustomerLicenses,
		seatCountByCustomerLicenseId,
	};
};
