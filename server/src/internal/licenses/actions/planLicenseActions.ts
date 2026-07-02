import { ErrCode, type LicenseCustomize, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { PlanService } from "@/internal/products/PlanService.js";
import { generateId } from "@/utils/genUtils.js";
import { serializePlanLicense } from "../licenseResponseUtils.js";
import { getLicenseProduct } from "../licenseUtils.js";
import { planLicenseRepo } from "../repos/index.js";
import { validatePooledFeatures } from "./validatePooledFeatures.js";

export const setPlanLicense = async ({
	ctx,
	parentPlanId,
	licensePlanId,
	includedQuantity,
	allowExtraQuantity,
	pooledFeatureIds = [],
	customize,
	metadata,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
	includedQuantity: number;
	allowExtraQuantity: boolean;
	pooledFeatureIds?: string[];
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

	validatePooledFeatures({
		ctx,
		pooledFeatureIds,
		licenseProduct,
		customize,
	});

	const planLicense = await planLicenseRepo.upsert({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		id: generateId("plan_lic"),
		parentInternalProductId: parentProduct.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
		includedQuantity,
		allowExtraQuantity,
		pooledFeatureIds,
		customize,
		metadata,
	});

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

	const rows = await planLicenseRepo.listWithLicensePlanIdByParent({
		db: ctx.db,
		parentInternalProductId: parentProduct.internal_id,
	});

	return rows.map(({ planLicense, licensePlanId }) =>
		serializePlanLicense({
			planLicense,
			parentPlanId: parentProduct.id,
			licensePlanId,
		}),
	);
};
