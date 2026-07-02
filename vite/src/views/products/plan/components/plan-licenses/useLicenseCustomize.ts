import {
	type FrontendProduct,
	type PlanLicense,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { productToLicenseCustomize } from "./licenseCustomizeUtils";
import { runWithErrorToast } from "./runWithErrorToast";
import { useLicenseQuantityStore } from "./useLicenseQuantityStore";

/**
 * Seeds the inline editor with the license's effective items and persists edits
 * to the plan-license `customize` (preserving the included quantity) via
 * set_plan_license.
 */
export const useLicenseCustomize = ({
	parentPlanId,
	planLicense,
	license,
	items,
}: {
	parentPlanId: string;
	planLicense: PlanLicense;
	license: ProductV2;
	items: ProductItem[];
}) => {
	const { features } = useFeaturesQuery();
	const { org } = useOrg();
	const { setPlanLicense } = usePlanLicensesQuery(parentPlanId);

	const seededProduct = productV2ToFrontendProduct({
		product: { ...license, items },
	});

	const save = (draftProduct: FrontendProduct) =>
		runWithErrorToast(async () => {
			// Read the quantity draft imperatively at save time so editing it
			// doesn't re-render this card on every keystroke.
			const includedQuantity =
				useLicenseQuantityStore.getState().drafts[license.id] ??
				planLicense.included_quantity;
			await setPlanLicense.mutateAsync({
				parent_plan_id: parentPlanId,
				license_plan_id: license.id,
				included_quantity: includedQuantity,
				allow_extra_quantity: planLicense.allow_extra_quantity,
				customize: productToLicenseCustomize({
					product: draftProduct,
					features,
					currency: org?.default_currency ?? "USD",
				}),
			});
		}, "Failed to save license");

	return { seededProduct, save };
};
