import {
	ErrCode,
	type FullCusProduct,
	type LicenseOp,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

/**
 * Takes run before customer-product inserts: an empty take aborts the plan
 * before anything is written, and each provisioned seat is stamped with its
 * pool id so it stays anchored across pool reparenting. A crash between take
 * and insert is healed by reconcileAssignmentBalances, which recomputes
 * remaining from live assignments.
 */
export const executeLicenseTakes = async ({
	ctx,
	licenseOps,
	insertCustomerProducts,
}: {
	ctx: AutumnContext;
	licenseOps: LicenseOp[] | undefined;
	insertCustomerProducts: FullCusProduct[];
}) => {
	for (const licenseOp of licenseOps ?? []) {
		if (licenseOp.op !== "take") continue;
		const balance = await customerLicenseRepo.upsertGranted({
			db: ctx.db,
			internalCustomerId: licenseOp.internalCustomerId,
			parentCustomerProductId: licenseOp.parentCustomerProductId,
			licenseInternalProductId: licenseOp.licenseInternalProductId,
			planLicenseId: licenseOp.planLicenseId,
			granted: licenseOp.granted,
		});
		const taken = await customerLicenseRepo.takeAssignment({
			db: ctx.db,
			customerLicenseId: balance.id,
		});
		if (!taken) {
			throw new RecaseError({
				message: "No available licenses for this plan.",
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const seat = insertCustomerProducts.find(
			(customerProduct) => customerProduct.id === licenseOp.customerProductId,
		);
		if (seat) seat.customer_license_id = taken.id;
	}
};

export const executeLicenseReleases = async ({
	ctx,
	licenseOps,
}: {
	ctx: AutumnContext;
	licenseOps: LicenseOp[] | undefined;
}) => {
	for (const licenseOp of licenseOps ?? []) {
		if (licenseOp.op !== "release") continue;
		// The pool anchor survives reparenting; the (parent, license) pair is the
		// legacy fallback for unstamped seats.
		if (licenseOp.customerLicenseId) {
			await customerLicenseRepo.releaseAssignmentsById({
				db: ctx.db,
				customerLicenseId: licenseOp.customerLicenseId,
				count: 1,
			});
			continue;
		}
		await customerLicenseRepo.releaseAssignments({
			db: ctx.db,
			parentCustomerProductId: licenseOp.parentCustomerProductId,
			licenseInternalProductId: licenseOp.licenseInternalProductId,
			count: 1,
		});
	}
};
