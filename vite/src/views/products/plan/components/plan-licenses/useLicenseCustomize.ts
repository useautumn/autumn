import {
	type PlanLicense,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import {
	buildCustomizePlanLicense,
	type LicenseEditSnapshot,
} from "./licenseCustomizeUtils";
import { runWithErrorToast } from "./runWithErrorToast";

/**
 * Seeds the inline editor with the license's effective items and persists edits
 * to the plan-license `customize` (preserving the included quantity) via
 * link.
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
	const { linkLicense } = usePlanLicensesQuery(parentPlanId);

	const seededProduct = productV2ToFrontendProduct({
		product: { ...license, items },
	});

	const buildCustomize = ({ product, itemsChanged }: LicenseEditSnapshot) =>
		buildCustomizePlanLicense({
			product,
			planLicense,
			license,
			features,
			currency: org?.default_currency ?? "USD",
			itemsChanged,
		});

	const save = (snapshot: LicenseEditSnapshot) =>
		runWithErrorToast({
			action: async () => {
				await linkLicense.mutateAsync({
					parent_plan_id: parentPlanId,
					...buildCustomize(snapshot),
				});
			},
			fallbackMessage: "Failed to save license",
		});

	return { seededProduct, save, buildCustomize };
};
