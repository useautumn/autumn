import type { FullPlanLicense } from "@autumn/shared";
import type {
	PlanLicensePlan,
	PlanLicenseRowPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { generateId } from "@/utils/genUtils.js";
import { computeLicensePricesAndEntitlements } from "./computeLicensePricesAndEntitlements";
import { initPlanLicenseRow } from "./initPlanLicenseRow";

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
