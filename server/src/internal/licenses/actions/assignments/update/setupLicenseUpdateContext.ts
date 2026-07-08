import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { licenseAssignmentRepo } from "../../../repos/licenseAssignmentRepo.js";
import type { LicenseUpdateContext } from "./types.js";

export const setupLicenseUpdateContext = async ({
	ctx,
	assignmentId,
}: {
	ctx: AutumnContext;
	assignmentId: string;
}): Promise<LicenseUpdateContext> => {
	const assignment = await licenseAssignmentRepo.getAssignmentById({
		db: ctx.db,
		assignmentId,
	});
	if (!assignment) {
		throw new RecaseError({
			message: assignmentId
				? `License assignment ${assignmentId} not found.`
				: "License assignment not found.",
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	const customer = await CusService.getByInternalId({
		db: ctx.db,
		internalId: assignment.internal_customer_id,
		errorIfNotFound: false,
	});

	return {
		assignment,
		customer,
		detachCustomerId: customer?.id ?? assignment.internal_customer_id,
	};
};
