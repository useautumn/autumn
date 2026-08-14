import type { FullPlanLicense } from "@autumn/shared";
import { computeLicensePricesAndEntitlements } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/computePlanLicenseRowPlan/computeLicensePricesAndEntitlements";
import { initPlanLicenseRow } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computePlanLicensesPlan/computePlanLicenseRowPlan/initPlanLicenseRow";
import type {
	PlanLicensePlan,
	PlanLicenseRowPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { generateId } from "@/utils/genUtils.js";

/** Current link only if it lives on this parent row — a version mint leaves the old row's links behind. */
const planLicenseOnThisParent = ({
	planLicense,
	parentInternalProductId,
}: {
	planLicense: PlanLicensePlan;
	parentInternalProductId: string;
}): FullPlanLicense | null =>
	planLicense.currentPlanLicense?.parent_internal_product_id ===
	parentInternalProductId
		? planLicense.currentPlanLicense
		: null;

const computeRemovePlanLicenseRow = ({
	currentPlanLicense,
	referencedByCustomer,
}: {
	currentPlanLicense: FullPlanLicense | null;
	referencedByCustomer: boolean;
}): PlanLicenseRowPlan | undefined => {
	if (!currentPlanLicense) return undefined;
	if (referencedByCustomer)
		return { retirePlanLicenseId: currentPlanLicense.id };
	return { deletePlanLicenseId: currentPlanLicense.id };
};

/**
 * One link's row write: mint a fresh plan_license row or update the existing
 * one. A customer-referenced current row is immutable — retire it, mint a
 * successor. Execute replays the result verbatim.
 */
export const computePlanLicenseRowPlan = ({
	planLicense,
	parentInternalProductId,
	referencedPlanLicenseIds,
}: {
	planLicense: PlanLicensePlan;
	parentInternalProductId: string;
	referencedPlanLicenseIds: Set<string>;
}): PlanLicenseRowPlan | undefined => {
	const currentPlanLicense = planLicenseOnThisParent({
		planLicense,
		parentInternalProductId,
	});

	const referencedByCustomer =
		currentPlanLicense !== null &&
		referencedPlanLicenseIds.has(currentPlanLicense.id);

	if (planLicense.op === "none" && currentPlanLicense) return undefined;

	if (planLicense.op === "remove") {
		return computeRemovePlanLicenseRow({
			currentPlanLicense,
			referencedByCustomer,
		});
	}

	if (!planLicense.licenseProduct) return undefined;

	const writesFreshRow = !currentPlanLicense || referencedByCustomer;
	const rowId = writesFreshRow ? generateId("plan_lic") : currentPlanLicense.id;
	const pricesAndEntitlements = computeLicensePricesAndEntitlements({
		planLicense,
		writesFreshRow,
	});

	return {
		...(referencedByCustomer
			? { retirePlanLicenseId: currentPlanLicense.id }
			: {}),
		row: initPlanLicenseRow({
			rowId,
			planLicense,
			parentInternalProductId,
			licenseInternalProductId: planLicense.licenseProduct.internal_id,
		}),
		...(pricesAndEntitlements
			? { junction: { planLicenseId: rowId, ...pricesAndEntitlements } }
			: {}),
	};
};
