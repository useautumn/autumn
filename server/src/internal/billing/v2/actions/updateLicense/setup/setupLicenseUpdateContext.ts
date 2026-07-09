import { ErrCode, RecaseError, type UpdateLicenseParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { LicenseUpdateContext } from "../types.js";

export const setupLicenseUpdateContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateLicenseParams;
}): Promise<LicenseUpdateContext> => {
	const [fullCustomer, assignment] = await Promise.all([
		setupFullCustomerContext({
			ctx,
			params: { customer_id: params.customer_id },
		}),
		licenseAssignmentRepo.getAssignmentById({
			db: ctx.db,
			assignmentId: params.assignment_id,
		}),
	]);
	if (
		!assignment ||
		assignment.internal_customer_id !== fullCustomer.internal_id
	) {
		throw new RecaseError({
			message: `License assignment ${params.assignment_id} not found.`,
			code: ErrCode.InvalidRequest,
			statusCode: 404,
		});
	}

	const entity = assignment.internal_entity_id
		? await licenseAssignmentRepo.getEntityByInternalId({
				db: ctx.db,
				internalEntityId: assignment.internal_entity_id,
			})
		: undefined;

	return {
		fullCustomer,
		assignment,
		entityExternalId: entity?.id ?? undefined,
	};
};
