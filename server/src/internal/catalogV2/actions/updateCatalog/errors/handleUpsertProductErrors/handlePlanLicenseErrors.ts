import {
	ErrCode,
	findDuplicate,
	ProductNotFoundError,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
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
	}
};
