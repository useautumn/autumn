import { ErrCode, type LicenseCustomize, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
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

	// 2. Compute the effective product and validate the link against it.
	// An empty items array means stock — a frozen copy of today's items would
	// silently stop base-item edits from rolling forward.
	const normalizedCustomize = customize?.items?.length ? customize : null;
	const computation = normalizedCustomize?.items
		? await computeLicenseCustomize({
				ctx,
				licenseProduct,
				items: normalizedCustomize.items,
			})
		: null;
	const effectiveProduct = computation?.effectiveProduct ?? licenseProduct;

	validateLicenseLink({
		parentProduct,
		licenseProduct: effectiveProduct,
		prepaidOnly,
		licensePlanId,
		customizeItems: normalizedCustomize?.items,
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

	// 3. Execute: upsert the link and materialize its items atomically, so a
	// failed customize step cannot leave the link with stale content
	const planLicense = await ctx.db.transaction(async (tx) => {
		const txCtx = { ...ctx, db: tx as unknown as DrizzleCli };
		const upserted = await planLicenseRepo.upsert({
			db: txCtx.db,
			parentInternalProductId: parentProduct.internal_id,
			licenseInternalProductId: licenseProduct.internal_id,
			included,
			prepaidOnly,
			metadata,
		});

		if (computation) {
			await persistLicenseCustomize({
				ctx: txCtx,
				planLicenseId: upserted.id,
				computation,
			});
		} else if (customize !== undefined && normalizedCustomize === null) {
			await clearLicenseCustomize({ ctx: txCtx, planLicenseId: upserted.id });
		}
		return upserted;
	});

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
