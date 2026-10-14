import {
	type Feature,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useInitialLicensePatches } from "./LicenseCustomizeCollector";
import {
	buildCustomizePlanLicense,
	buildPlanLicenseParams,
	type LicenseEditSnapshot,
	licenseItemsWithCustomize,
	planLicenseItems,
} from "./licenseCustomizeUtils";

export const useLicenseCardEditor = ({
	planLicense,
	license,
	features,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	features: Feature[];
}) => {
	const { org } = useOrg();
	const currency = org?.default_currency ?? "USD";
	const seededCustomize = useInitialLicensePatches()[license.id]?.customize;
	const catalogItems = planLicense.customize
		? licenseItemsWithCustomize({
				license,
				customize: planLicense.customize,
				features,
				currency,
			})
		: planLicenseItems({ license });
	const catalogLicense = { ...license, items: catalogItems };

	const items = seededCustomize
		? licenseItemsWithCustomize({
				license: catalogLicense,
				customize: seededCustomize,
				features,
				currency,
			})
		: catalogItems;

	const seededProduct = productV2ToFrontendProduct({
		product: { ...license, items },
	});

	const buildEntry = ({
		product,
		itemsChanged,
	}: LicenseEditSnapshot): PlanLicenseParams =>
		buildPlanLicenseParams({
			product,
			planLicense,
			license,
			features,
			currency,
			itemsChanged,
		});

	const buildCustomize = ({ product, itemsChanged }: LicenseEditSnapshot) =>
		buildCustomizePlanLicense({
			product,
			planLicense,
			license: catalogLicense,
			features,
			currency,
			itemsChanged: itemsChanged || Boolean(seededCustomize),
		});

	return { seededProduct, buildEntry, buildCustomize };
};
