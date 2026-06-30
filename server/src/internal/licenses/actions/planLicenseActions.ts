import {
	ErrCode,
	isCatalogPlanProduct,
	type LicenseCustomize,
	planLicenses,
	RecaseError,
	products,
} from "@autumn/shared";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { generateId } from "@/utils/genUtils.js";
import { serializePlanLicense } from "../licenseResponseUtils.js";
import { assertLicenseProduct, getLicenseProduct } from "../licenseUtils.js";

const licenseProducts = alias(products, "license_products");

export const setPlanLicense = async ({
	ctx,
	parentPlanId,
	licensePlanId,
	includedQuantity,
	allowExtraQuantity,
	customize,
	metadata,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
	includedQuantity: number;
	allowExtraQuantity: boolean;
	customize?: LicenseCustomize | null;
	metadata?: Record<string, unknown>;
}) => {
	const [parentProduct, licenseProduct] = await Promise.all([
		PlanService.getFull({
			db: ctx.db,
			idOrInternalId: parentPlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
		getLicenseProduct({
			db: ctx.db,
			idOrInternalId: licensePlanId,
			orgId: ctx.org.id,
			env: ctx.env,
		}),
	]);

	if (allowExtraQuantity) {
		throw new RecaseError({
			message: "Paid license overages are not supported yet.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (!isCatalogPlanProduct({ product: parentProduct })) {
		throw new RecaseError({
			message: `Parent product ${parentPlanId} is not a catalog plan.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	assertLicenseProduct({ product: licenseProduct });

	const [planLicense] = await ctx.db
		.insert(planLicenses)
		.values({
			id: generateId("plan_lic"),
			org_id: ctx.org.id,
			env: ctx.env,
			parent_internal_product_id: parentProduct.internal_id,
			license_internal_product_id: licenseProduct.internal_id,
			included_quantity: includedQuantity,
			allow_extra_quantity: allowExtraQuantity,
			customize: customize ?? null,
			metadata: metadata ?? {},
			created_at: Date.now(),
			updated_at: Date.now(),
		})
		.onConflictDoUpdate({
			target: [
				planLicenses.parent_internal_product_id,
				planLicenses.license_internal_product_id,
			],
			set: {
				included_quantity: includedQuantity,
				allow_extra_quantity: allowExtraQuantity,
				...(customize !== undefined ? { customize } : {}),
				...(metadata !== undefined ? { metadata } : {}),
				updated_at: Date.now(),
			},
		})
		.returning();

	return serializePlanLicense({
		planLicense,
		parentPlanId: parentProduct.id,
		licensePlanId: licenseProduct.id,
	});
};

export const listPlanLicenses = async ({
	ctx,
	parentPlanId,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
}) => {
	const parentProduct = await PlanService.getFull({
		db: ctx.db,
		idOrInternalId: parentPlanId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return await ctx.db
		.select({
			planLicense: planLicenses,
			licensePlanId: licenseProducts.id,
		})
		.from(planLicenses)
		.innerJoin(
			licenseProducts,
			eq(planLicenses.license_internal_product_id, licenseProducts.internal_id),
		)
		.where(
			eq(planLicenses.parent_internal_product_id, parentProduct.internal_id),
		)
		.then((rows) =>
			rows.map(({ planLicense, licensePlanId }) =>
				serializePlanLicense({
					planLicense,
					parentPlanId: parentProduct.id,
					licensePlanId,
				}),
			),
		);
};
