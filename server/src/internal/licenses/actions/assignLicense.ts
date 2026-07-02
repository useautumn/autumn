import { ErrCode, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { licenseAssignmentRepo } from "../repos/index.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";
import { insertProvisionedLicenseCustomerProduct } from "./provisionLicenseCustomerProduct.js";
import { reconcilePooledGrantsForCustomer } from "./reconcilePooledGrants.js";
import { resolveAssignableLicensePool } from "./resolveAssignableLicensePool.js";

export const assignLicense = async ({
	ctx,
	customerId,
	entityId,
	planId,
	version,
	poolId,
	parentSubscriptionId,
	metadata,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	planId: string;
	version?: number;
	poolId?: string;
	parentSubscriptionId?: string;
	metadata?: Record<string, unknown>;
}) => {
	const licenseProduct = await getLicenseProduct({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const entity = fullCustomer.entities?.find((item) => item.id === entityId);
	if (!entity) {
		throw new RecaseError({
			message: `Entity ${entityId} not found for customer ${customerId}.`,
			code: ErrCode.EntityNotFound,
			statusCode: 404,
		});
	}

	const existing = await licenseAssignmentRepo.findActive({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		internalCustomerId: fullCustomer.internal_id,
		internalEntityId: entity.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
	});
	if (existing) return existing;

	await ensurePoolsForCustomerProducts({
		ctx,
		customerProducts: fullCustomer.customer_products,
	});

	const { pool, licenseDefinition } = await resolveAssignableLicensePool({
		ctx,
		fullCustomer,
		licenseProduct,
		planId,
		poolId,
		parentSubscriptionId,
	});

	// Atomic core only: the provisioned product and its assignment land
	// together; double-assign races are backstopped by the partial unique index.
	const assignment = await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		const provisionedCustomerProduct =
			await insertProvisionedLicenseCustomerProduct({
				ctx: txCtx,
				fullCustomer,
				licenseProduct,
				licenseDefinition,
				internalEntityId: entity.internal_id,
			});

		return await licenseAssignmentRepo.insert({
			db: txCtx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			id: generateId("lic_asn"),
			licensePoolId: pool.id,
			internalCustomerId: fullCustomer.internal_id,
			internalEntityId: entity.internal_id,
			licenseInternalProductId: licenseProduct.internal_id,
			provisionedCustomerProductId: provisionedCustomerProduct.id,
			metadata,
		});
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		entityId,
		source: "license.assign",
	});
	await reconcilePooledGrantsForCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
	});

	return assignment;
};
