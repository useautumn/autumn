import {
	ErrCode,
	type FullCustomer,
	type FullProduct,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPaidQuantity, isLicensePoolParentStatus } from "../licenseUtils.js";
import { licenseAssignmentRepo, licensePoolRepo } from "../repos/index.js";

export const resolveAssignableLicensePool = async ({
	ctx,
	fullCustomer,
	licenseProduct,
	planId,
	poolId,
	parentSubscriptionId,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	licenseProduct: FullProduct;
	planId: string;
	poolId?: string;
	parentSubscriptionId?: string;
}) => {
	const poolRows = await licensePoolRepo.listAssignablePoolRows({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
		poolId,
		parentSubscriptionId,
	});

	if (poolRows.length === 0) {
		throw new RecaseError({
			message: `No license pool found for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const activePoolRows = poolRows.filter(({ parentCustomerProduct }) =>
		isLicensePoolParentStatus({ status: parentCustomerProduct.status }),
	);
	if (activePoolRows.length === 0) {
		throw new RecaseError({
			message: `No active license pool found for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	if (activePoolRows.length > 1 && !parentSubscriptionId && !poolId) {
		throw new RecaseError({
			message:
				"Multiple license pools match this license. Provide pool_id or parent_subscription_id.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const { pool, planLicense, customerProductLicense, paidCustomerProduct } =
		activePoolRows[0];
	// The pools source check + FK cascades guarantee exactly one definition.
	const licenseDefinition = (planLicense ?? customerProductLicense)!;
	const assigned = await licenseAssignmentRepo.countActiveByPoolId({
		db: ctx.db,
		licensePoolId: pool.id,
	});
	const available =
		licenseDefinition.included_quantity +
		getPaidQuantity({
			customerProduct: paidCustomerProduct,
		}) -
		assigned;

	if (available <= 0) {
		throw new RecaseError({
			message: `No available licenses for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return { pool, licenseDefinition };
};
