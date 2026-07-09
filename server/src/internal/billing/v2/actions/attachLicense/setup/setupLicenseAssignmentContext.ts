import {
	EntityNotFoundError,
	ErrCode,
	type LicenseAttachParams,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { getFullLicenseProduct } from "@/internal/licenses/licenseUtils.js";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import type { LicenseAssignmentContext } from "../types.js";
import { resolveLicenseAssignment } from "./resolveLicenseAssignment.js";

/** Composed setup for assignment actions: license product (archived-checked)
 * and customer context in parallel, then the customer-level product that gates
 * priced assignments — so compute stays a pure read. */
export const setupLicenseAssignmentContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: LicenseAttachParams;
}): Promise<LicenseAssignmentContext> => {
	const [licenseProduct, fullCustomer] = await Promise.all([
		getFullLicenseProduct({ ctx, idOrInternalId: params.plan_id }),
		setupFullCustomerContext({
			ctx,
			params: { customer_id: params.customer_id, entity_id: params.entity_id },
		}),
	]);
	if (licenseProduct.archived) {
		throw new RecaseError({
			message: `License plan ${params.plan_id} is archived and cannot be assigned.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (!fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	const customerLevelProduct =
		await licenseAssignmentRepo.findLatestActiveCustomerLevelCustomerProduct({
			db: ctx.db,
			internalCustomerId: fullCustomer.internal_id,
			internalProductId: licenseProduct.internal_id,
		});

	const resolution = await resolveLicenseAssignment({
		ctx,
		fullCustomer,
		entity: fullCustomer.entity,
		licenseProduct,
		planId: params.plan_id,
		parentPlanId: params.parent_plan_id,
	});

	return {
		fullCustomer,
		entity: fullCustomer.entity,
		licenseProduct,
		customerLevelProduct,
		planId: params.plan_id,
		parentPlanId: params.parent_plan_id,
		resolution,
	};
};
