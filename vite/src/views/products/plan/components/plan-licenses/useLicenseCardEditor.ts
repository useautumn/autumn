import {
	type Feature,
	type PlanLicense,
	type PlanLicenseParams,
	type ProductItem,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { updateProduct } from "@/views/products/product/utils/updateProduct";
import {
	buildCustomizePlanLicense,
	buildPlanLicenseParams,
	type LicenseEditSnapshot,
} from "./licenseCustomizeUtils";

/**
 * Seeds a license card's inline editor with the license plan's own items and
 * exposes its save/collect callbacks: item edits update the license plan
 * directly (in place — versioning a license is an explicit API action for
 * now), the link entry rides the parent's composed save, and the customize
 * entry feeds the attach/update collector.
 */
export const useLicenseCardEditor = ({
	planLicense,
	license,
	items,
	features,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	items: ProductItem[];
	features: Feature[];
}) => {
	const { org } = useOrg();
	const axiosInstance = useAxiosInstance();

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
			currency: org?.default_currency ?? "USD",
			itemsChanged,
		});

	return { seededProduct, buildEntry, saveItems, buildCustomize };
};
