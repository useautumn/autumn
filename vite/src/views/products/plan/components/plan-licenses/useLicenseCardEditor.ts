import {
	type Feature,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import { useInitialLicensePatches } from "./LicenseCustomizeCollector";
import {
	buildCustomizePlanLicense,
	buildPlanLicenseParams,
	type LicenseEditSnapshot,
	licenseItemsWithCustomize,
	planLicenseItems,
} from "./licenseCustomizeUtils";

/**
 * Seeds a license card's inline editor with the license plan's own items (plus
 * any saved customize patch, so edits survive editor reopens) and exposes its
 * save/collect callbacks: item edits update the license plan directly (in
 * place — versioning a license is an explicit API action for now), the link
 * entry rides the parent's composed save, and the customize entry feeds the
 * attach/update collector.
 */
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
	const axiosInstance = useAxiosInstance();
	const currency = org?.default_currency ?? "USD";
	const seededCustomize = useInitialLicensePatches()[license.id]?.customize;

	const items = seededCustomize
		? licenseItemsWithCustomize({
				license,
				customize: seededCustomize,
				features,
				currency,
			})
		: planLicenseItems({ license });

	const seededProduct = productV2ToFrontendProduct({
		product: { ...license, items },
	});

	const buildEntry = (): PlanLicenseParams =>
		buildPlanLicenseParams({ planLicense, license });

	const saveItems = async ({
		product,
		itemsChanged,
	}: LicenseEditSnapshot): Promise<boolean> => {
		if (!itemsChanged) return true;
		const updated = await updateProduct({
			axiosInstance,
			productId: license.id,
			product: { items: product.items },
			disableVersion: true,
			onSuccess: async () => {},
		});
		return Boolean(updated);
	};

	const buildCustomize = ({ product, itemsChanged }: LicenseEditSnapshot) =>
		buildCustomizePlanLicense({
			product,
			planLicense,
			license,
			features,
			currency,
			// A patch-seeded card must keep diffing against the stock license
			// even when untouched, or re-saving would drop its customization.
			itemsChanged: itemsChanged || Boolean(seededCustomize),
		});

	return { seededProduct, buildEntry, saveItems, buildCustomize };
};
