import {
	ErrCode,
	findDuplicate,
	hasLicenseCustomize,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { findCustomizedPaidFeatureIdOnLicense } from "@/internal/licenses/actions/links/findCustomizedPaidFeatureIdOnLicense";
import { validateLicenseLink } from "@/internal/licenses/actions/links/validateLicenseLink";

const parentLicensePlanIds = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): string[] => {
	const parentProduct =
		upsert.row.currentFullProduct ?? upsert.row.baseFullProduct;
	return [
		...new Set(
			(parentProduct?.parent_plan_licenses ?? []).map(
				(link) => link.product.id,
			),
		),
	];
};

/** Declared licenses[] guards: missing child, nesting, duplicates, link rules. */
export const handlePlanLicenseErrors = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): void => {
	const planLicenses = upsert.planLicenses;
	if (!planLicenses) return;

	const declared = planLicenses.filter(
		(planLicense) => planLicense.op !== "remove",
	);

	const duplicate = findDuplicate(
		declared.map((planLicense) => planLicense.licensePlanId),
	);
	if (duplicate) {
		throw new RecaseError({
			message: `Duplicate license ${duplicate} in licenses`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (declared.length > 0) {
		const parentIds = parentLicensePlanIds({ upsert });
		if (parentIds.length > 0) {
			throw new RecaseError({
				message: `Cannot add licenses to ${upsert.row.planId}: it is offered as a license under ${parentIds.join(", ")}.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	for (const planLicense of declared) {
		// Declared anchor must resolve to a live row; drafts are allowed.
		if (planLicense.declaredVersionSlug !== undefined) {
			if (!planLicense.licenseProduct) {
				throw new RecaseError({
					message: `License ${planLicense.licensePlanId} has no version with slug ${planLicense.declaredVersionSlug}`,
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
			if (planLicense.licenseProduct.archived) {
				throw new RecaseError({
					message: `Cannot anchor license ${planLicense.licensePlanId} to archived version ${planLicense.declaredVersionSlug}`,
					code: ErrCode.InvalidRequest,
					statusCode: StatusCodes.BAD_REQUEST,
				});
			}
		}

		if (!planLicense.effectiveLicenseProduct) {
			throw new ProductNotFoundError({
				productId: planLicense.licensePlanId,
			});
		}

		// Validate the content customers would receive, post-customize.
		validateLicenseLink({
			parentProduct: upsert.row.nextFullProduct,
			licenseProduct: planLicense.effectiveLicenseProduct,
			prepaidOnly: planLicense.prepaidOnly,
			licensePlanId: planLicense.licensePlanId,
		});

		if (
			!hasLicenseCustomize(planLicense.customize) ||
			!planLicense.licenseProduct
		) {
			continue;
		}

		const paidFeatureId = findCustomizedPaidFeatureIdOnLicense({
			stockProduct: planLicense.licenseProduct,
			effectiveProduct: planLicense.effectiveLicenseProduct,
		});
		if (!paidFeatureId) continue;

		throw new RecaseError({
			message: `Paid features are not supported on plan licenses (${paidFeatureId}).`,
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
