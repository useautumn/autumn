import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { LicenseUpdateContext } from "../types.js";

export const setupLicenseUpdateContext = async ({
	ctx,
	customerId,
	assignmentId,
}: {
	ctx: AutumnContext;
	customerId: string;
	assignmentId: string;
}): Promise<LicenseUpdateContext> => {
	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});

	const assignment = await licenseAssignmentRepo.getAssignmentById({
		db: ctx.db,
		assignmentId,
	});
	if (
		!assignment ||
		assignment.internal_customer_id !== fullCustomer.internal_id
	) {
		throw new RecaseError({
			message: `License assignment ${assignmentId} not found.`,
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	return { fullCustomer, assignment };
};
