import {
	customerProductLicenses,
	customerProducts,
	ErrCode,
	type FullCustomer,
	type FullProduct,
	licenseAssignments,
	licensePools,
	planLicenses,
	RecaseError,
} from "@autumn/shared";
import { and, arrayContains, count, eq, isNull, or } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getPaidQuantity,
	isLicensePoolParentStatus,
	parentCustomerProducts,
} from "../licenseUtils.js";

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
	const poolRows = await ctx.db
		.select({
			pool: licensePools,
			planLicense: planLicenses,
			customerProductLicense: customerProductLicenses,
			paidCustomerProduct: customerProducts,
			parentCustomerProduct: parentCustomerProducts,
		})
		.from(licensePools)
		.innerJoin(
			parentCustomerProducts,
			eq(licensePools.parent_customer_product_id, parentCustomerProducts.id),
		)
		.leftJoin(planLicenses, eq(licensePools.plan_license_id, planLicenses.id))
		.leftJoin(
			customerProductLicenses,
			eq(licensePools.customer_product_license_id, customerProductLicenses.id),
		)
		.leftJoin(
			customerProducts,
			eq(licensePools.license_customer_product_id, customerProducts.id),
		)
		.where(
			and(
				eq(licensePools.org_id, ctx.org.id),
				eq(licensePools.env, ctx.env),
				eq(licensePools.internal_customer_id, fullCustomer.internal_id),
				eq(
					licensePools.license_internal_product_id,
					licenseProduct.internal_id,
				),
				poolId ? eq(licensePools.id, poolId) : undefined,
				parentSubscriptionId
					? or(
							eq(licensePools.parent_customer_product_id, parentSubscriptionId),
							eq(parentCustomerProducts.external_id, parentSubscriptionId),
							arrayContains(parentCustomerProducts.subscription_ids, [
								parentSubscriptionId,
							]),
						)
					: undefined,
			),
		);

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
	const licenseDefinition = planLicense ?? customerProductLicense;
	if (!licenseDefinition) {
		throw new RecaseError({
			message: `No license definition found for ${planId}.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	const [{ value: assigned }] = await ctx.db
		.select({ value: count() })
		.from(licenseAssignments)
		.where(
			and(
				eq(licenseAssignments.license_pool_id, pool.id),
				isNull(licenseAssignments.ended_at),
			),
		);
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
