import { EntityNotFoundError, ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { getFullLicenseProduct } from "../../../licenseUtils.js";
import type { LicenseAssignmentContext } from "./types.js";

/** Composed setup for assignment actions: license product (archived-checked),
 * customer context, and the target entity — billing's setup-context shape. */
export const setupLicenseAssignmentContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer_id: string;
		entity_id: string;
		plan_id: string;
		parent_plan_id?: string;
	};
}): Promise<LicenseAssignmentContext> => {
	const licenseProduct = await getFullLicenseProduct({
		ctx,
		idOrInternalId: params.plan_id,
	});
	if (licenseProduct.archived) {
		throw new RecaseError({
			message: `License plan ${params.plan_id} is archived and cannot be assigned.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const fullCustomer = await setupFullCustomerContext({
		ctx,
		params: {
			customer_id: params.customer_id,
			entity_id: params.entity_id,
		},
	});
	if (!fullCustomer.entity) {
		throw new EntityNotFoundError({ entityId: params.entity_id });
	}

	return {
		fullCustomer,
		entity: fullCustomer.entity,
		licenseProduct,
		planId: params.plan_id,
		parentPlanId: params.parent_plan_id,
	};
};
