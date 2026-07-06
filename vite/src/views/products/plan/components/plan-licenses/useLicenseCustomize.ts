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
import { buildCustomizePlanLicense } from "./licenseCustomizeUtils";
import { runWithErrorToast } from "./runWithErrorToast";

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

	const buildCustomize = ({
		product,
		itemsChanged,
	}: {
		product: FrontendProduct;
		itemsChanged: boolean;
	}) =>
		buildCustomizePlanLicense({
			product,
			planLicense,
			license,
			features,
			currency: org?.default_currency ?? "USD",
			itemsChanged,
		});

	const save = (args: { product: FrontendProduct; itemsChanged: boolean }) =>
		runWithErrorToast(async () => {
			await setPlanLicense.mutateAsync({
				parent_plan_id: parentPlanId,
				...buildCustomize(args),
			});
		}, "Failed to save license");

	return { seededProduct, save, buildCustomize };
};
