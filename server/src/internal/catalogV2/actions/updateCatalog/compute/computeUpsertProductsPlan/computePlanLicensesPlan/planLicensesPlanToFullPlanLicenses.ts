import type { FullPlanLicense } from "@autumn/shared";
import type { PlanLicensePlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { resolveCustomizedFlag } from "./row/initPlanLicenseRow";

const planLicensePlanToFullPlanLicense = ({
	planLicense,
	parentInternalProductId,
}: {
	planLicense: PlanLicensePlan;
	parentInternalProductId: string;
}): FullPlanLicense | null => {
	if (planLicense.op === "remove") return null;
	if (planLicense.op === "none" && planLicense.currentPlanLicense) {
		const product = planLicense.effectiveLicenseProduct;
		if (!product) return planLicense.currentPlanLicense;
		return {
			...planLicense.currentPlanLicense,
			license_internal_product_id: product.internal_id,
			product,
		};
	}

	const product =
		planLicense.effectiveLicenseProduct ?? planLicense.licenseProduct;
	if (!product) return null;

	const current = planLicense.currentPlanLicense;
	const customized = resolveCustomizedFlag({ planLicense });

	return {
		id:
			planLicense.rowPlan?.row?.id ??
			current?.id ??
			`projected_${planLicense.licensePlanId}`,
		parent_internal_product_id: parentInternalProductId,
		is_custom: current?.is_custom ?? false,
		license_internal_product_id: product.internal_id,
		included: planLicense.included,
		prepaid_only: planLicense.prepaidOnly,
		customized,
		metadata: planLicense.metadata ?? current?.metadata ?? null,
		created_at: current?.created_at ?? 0,
		updated_at: current?.updated_at ?? 0,
		product,
		...(customized && planLicense.licenseProduct
			? { base_product: planLicense.licenseProduct }
			: {}),
	};
};

/** After-set plan_license links for nextFullProduct. Removes are dropped. */
export const planLicensesPlanToFullPlanLicenses = ({
	planLicenses,
	parentInternalProductId,
}: {
	planLicenses: PlanLicensePlan[];
	parentInternalProductId: string;
}): FullPlanLicense[] =>
	planLicenses.flatMap((planLicense) => {
		const license = planLicensePlanToFullPlanLicense({
			planLicense,
			parentInternalProductId,
		});
		return license ? [license] : [];
	});
