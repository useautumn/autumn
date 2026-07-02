import { ErrCode, licenseAssignments, RecaseError } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { generateId } from "@/utils/genUtils.js";
import { assertLicenseProduct, getLicenseProduct } from "../licenseUtils.js";
import { ensurePoolsForCustomerProducts } from "./ensureLicensePools.js";
import { insertProvisionedLicenseCustomerProduct } from "./provisionLicenseCustomerProduct.js";
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
	assertLicenseProduct({ product: licenseProduct });

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

	const assignment = await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as typeof ctx.db };
		const existing = await tx.query.licenseAssignments.findFirst({
			where: and(
				eq(licenseAssignments.org_id, ctx.org.id),
				eq(licenseAssignments.env, ctx.env),
				eq(licenseAssignments.internal_customer_id, fullCustomer.internal_id),
				eq(licenseAssignments.internal_entity_id, entity.internal_id),
				eq(
					licenseAssignments.license_internal_product_id,
					licenseProduct.internal_id,
				),
				isNull(licenseAssignments.ended_at),
			),
		});
		if (existing) return existing;

		await ensurePoolsForCustomerProducts({
			ctx: txCtx,
			customerProducts: fullCustomer.customer_products,
		});

		const { pool, licenseDefinition } = await resolveAssignableLicensePool({
			ctx: txCtx,
			fullCustomer,
			licenseProduct,
			planId,
			poolId,
			parentSubscriptionId,
		});

		const provisionedCustomerProduct =
			await insertProvisionedLicenseCustomerProduct({
				ctx: txCtx,
				fullCustomer,
				licenseProduct,
				licenseDefinition,
				internalEntityId: entity.internal_id,
			});

		const [assignment] = await tx
			.insert(licenseAssignments)
			.values({
				id: generateId("lic_asn"),
				org_id: ctx.org.id,
				env: ctx.env,
				license_pool_id: pool.id,
				internal_customer_id: fullCustomer.internal_id,
				internal_entity_id: entity.internal_id,
				license_internal_product_id: licenseProduct.internal_id,
				provisioned_customer_product_id: provisionedCustomerProduct.id,
				started_at: Date.now(),
				ended_at: null,
				metadata: metadata ?? {},
			})
			.returning();

		return assignment;
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		entityId,
		source: "license.assign",
	});

	return assignment;
};
