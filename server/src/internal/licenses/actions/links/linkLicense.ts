import { ErrCode, type LicenseCustomize, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { serializePlanLicense } from "../../licenseResponseUtils.js";
import { getFullLicenseProduct } from "../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { computeLicenseCustomize } from "../customize/computeLicenseCustomize.js";
import { deriveLicenseCustomize } from "../customize/deriveLicenseCustomize.js";
import {
	clearLicenseCustomize,
	persistLicenseCustomize,
} from "../customize/persistLicenseCustomize.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

export const linkLicense = async ({
	ctx,
	parentPlanId,
	licensePlanId,
	included,
	prepaidOnly,
	customize,
	metadata,
}: {
	ctx: AutumnContext;
	parentPlanId: string;
	licensePlanId: string;
	included: number;
	prepaidOnly: boolean;
	customize?: LicenseCustomize | null;
	metadata?: Record<string, unknown>;
}) => {
	// 1. Setup
	const [parentProduct, licenseProduct] = await Promise.all([
		getFullLicenseProduct({ ctx, idOrInternalId: parentPlanId }),
		getFullLicenseProduct({ ctx, idOrInternalId: licensePlanId }),
	]);
	const existingLink = await planLicenseRepo.getCatalogByParentAndLicense({
		db: ctx.db,
		parentInternalProductId: parentProduct.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
	});

	// 2. Compute the effective product and validate the link against it
	const computation = customize?.items
		? await computeLicenseCustomize({
				ctx,
				licenseProduct,
				items: customize.items,
			})
		: null;
	const effectiveProduct = computation?.effectiveProduct ?? licenseProduct;

	validateLicenseLink({
		parentProduct,
		licenseProduct: effectiveProduct,
		prepaidOnly,
		licensePlanId,
		customizeItems: customize?.items,
	});

	if (existingLink && included < existingLink.included) {
		const maxAssigned = await licenseAssignmentRepo.maxActiveCountByCatalogLink(
			{
				db: ctx.db,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: licenseProduct.internal_id,
			},
		);
		if (maxAssigned > included) {
			throw new RecaseError({
				message: `Cannot set included to ${included}: a customer has ${maxAssigned} active assignments for ${licensePlanId}. Unassign licenses first.`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}
	}

	// 3. Execute: upsert the link, then materialize its items
	const planLicense = await planLicenseRepo.upsert({
		db: ctx.db,
		parentInternalProductId: parentProduct.internal_id,
		licenseInternalProductId: licenseProduct.internal_id,
		included,
		prepaidOnly,
		metadata,
	});

	if (computation) {
		await persistLicenseCustomize({
			ctx,
			planLicenseId: planLicense.id,
			computation,
		});
	} else if (customize === null) {
		await clearLicenseCustomize({ ctx, planLicenseId: planLicense.id });
	}

	return serializePlanLicense({
		planLicense,
		parentPlanId: parentProduct.id,
		licensePlanId: licenseProduct.id,
		customize: await deriveLicenseCustomize({
			ctx,
			licenseProduct,
			planLicenseId: planLicense.id,
		}),
	});
};
