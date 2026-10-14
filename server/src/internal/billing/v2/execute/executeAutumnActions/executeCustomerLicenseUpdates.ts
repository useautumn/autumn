import {
	type CustomerLicenseUpdate,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";

export const executeCustomerLicenseUpdates = async ({
	ctx,
	customerLicenseUpdates,
}: {
	ctx: AutumnContext;
	customerLicenseUpdates: CustomerLicenseUpdate[] | undefined;
}) => {
	for (const update of customerLicenseUpdates ?? []) {
		if (update.paidQuantity !== undefined && update.customerLicenseId) {
			await customerLicenseRepo.setPaidQuantity({
				db: ctx.db,
				customerLicenseId: update.customerLicenseId,
				paidQuantity: update.paidQuantity,
			});
			continue;
		}
		if (update.remainingChange < 0 && update.customerLicenseId) {
			const taken = await customerLicenseRepo.takeAssignment({
				db: ctx.db,
				customerLicenseId: update.customerLicenseId,
				count: -update.remainingChange,
			});
			if (!taken) {
				throw new RecaseError({
					message: "No available licenses for this plan.",
					code: ErrCode.InvalidRequest,
					statusCode: 400,
				});
			}
		} else if (update.remainingChange > 0 && update.customerLicenseLinkId) {
			await customerLicenseRepo.releaseAssignmentsByLinkId({
				db: ctx.db,
				customerLicenseLinkId: update.customerLicenseLinkId,
				count: update.remainingChange,
			});
		}
	}
};
