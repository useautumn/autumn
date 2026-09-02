import {
	type FullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerLicenses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";
import { listFullCustomerProductsByIds } from "@/internal/licenses/repos/listFullCustomerProductsByIds";

/** Hydrates released spare seats for quantity shrink — getFull omits seat rows. */
export const setupUnusedLicenseAssignments = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}): Promise<Record<string, FullCusProduct[]>> => {
	const customerLicenseLinkIds = fullCustomerToCustomerLicenses({
		fullCustomer,
	}).map((customerLicense) => customerLicense.link_id);
	if (customerLicenseLinkIds.length === 0) return {};

	const unusedRows = await licenseAssignmentRepo.listUnusedAssignmentsByLinkIds({
		db: ctx.db,
		customerLicenseLinkIds,
	});
	if (unusedRows.length === 0) return {};

	const fullById = new Map(
		(
			await listFullCustomerProductsByIds({
				db: ctx.db,
				customerProductIds: unusedRows.map((row) => row.id),
			})
		).map((customerProduct) => [customerProduct.id, customerProduct]),
	);

	const unusedLicenseAssignmentsByLinkId: Record<string, FullCusProduct[]> = {};
	for (const row of unusedRows) {
		const customerProduct = fullById.get(row.id);
		const linkId = row.customer_license_link_id;
		if (!customerProduct || !linkId) continue;
		(unusedLicenseAssignmentsByLinkId[linkId] ??= []).push(customerProduct);
	}
	return unusedLicenseAssignmentsByLinkId;
};
