import { ErrCode, type LicenseOp, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

/**
 * Takes run before customer-product inserts: an empty take aborts the plan
 * before anything is written. A crash between take and insert is healed by
 * reconcileAssignmentBalances, which recomputes remaining from live
 * assignments.
 */
export const executeLicenseTakes = async ({
	ctx,
	licenseOps,
}: {
	ctx: AutumnContext;
	licenseOps: LicenseOp[] | undefined;
}) => {
	for (const licenseOp of licenseOps ?? []) {
		if (licenseOp.op !== "take") continue;
		const balance = await customerLicenseRepo.upsertGranted({
			db: ctx.db,
			internalCustomerId: licenseOp.internalCustomerId,
			parentCustomerProductId: licenseOp.parentCustomerProductId,
			licenseInternalProductId: licenseOp.licenseInternalProductId,
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
		await customerLicenseRepo.releaseAssignments({
			db: ctx.db,
			parentCustomerProductId: licenseOp.parentCustomerProductId,
			licenseInternalProductId: licenseOp.licenseInternalProductId,
			count: 1,
		});
	}
};
