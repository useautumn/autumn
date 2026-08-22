import { isFeaturePriceItem, type PlanLicenseParams } from "@autumn/shared";
import { Button, ShortcutButton } from "@autumn/ui";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useFetchPreviewUpdateCatalog } from "@/hooks/queries/catalog/usePreviewUpdateCatalog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useHasContentChanges,
	useIsCusPlanEditor,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { CatalogV2Service } from "@/services/CatalogV2Service";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr, navigateTo } from "@/utils/genUtils";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { buildCatalogUpdatePlans } from "../catalog/buildUpdateCatalogPlanParams";
import { catalogPreviewOpensDialog } from "../catalog/catalogPlanPreview";
import { checkItemCurrenciesValid } from "../utils/currencyUtils";
import { validateItemsBeforeSave } from "../utils/validateItemsBeforeSave";
import { useVariantLinkVisibility } from "../hooks/useVariantLinkVisibility";
import { PlanEditorBar } from "./PlanEditorBar";
import {
	commitLicenseChanges,
	discardAllLicenses,
	getLicenseUpdatePayload,
	useHasLicenseChanges,
} from "./plan-licenses/useLicenseSaveRegistry";

interface SaveChangesBarProps {
	isOnboarding?: boolean;
}

export const SaveChangesBar = ({
	isOnboarding = false,
}: SaveChangesBarProps) => {
	const axiosInstance = useAxiosInstance();
	const navigate = useNavigate();
	const { setShowNewVersionDialog, catalogLicenses } = useProductContext();

	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const setBaseProduct = useProductStore((s) => s.setBaseProduct);
	const { type: sheetType } = useSheetStore();
	const planHasChanges = useHasChanges();
	const contentHasChanges = useHasContentChanges();
	const licenseHasChanges = useHasLicenseChanges();
	const hasChanges = planHasChanges || licenseHasChanges;
	const { basePlanId: persistedBasePlanId } = useVariantLinkVisibility(product);
	const planLicenses = catalogLicenses.map(({ planLicense }) => planLicense);
	const { features = [] } = useFeaturesQuery();
	const fetchPreviewUpdateCatalog = useFetchPreviewUpdateCatalog();

	const [saving, setSaving] = useState(false);

	const { invalidate: invalidateProducts } = useProductsQuery();
	const { refetch: queryRefetch, invalidate: invalidateProduct } =
		useProductQuery();

	const isCusPlanEditor = useIsCusPlanEditor();
	let saveButtonText = "Save";
	if (isCusPlanEditor) {
		saveButtonText = "Save and Return";
	}

	const handleSaveClicked = async () => {
		if (planHasChanges) {
			for (const item of product.items) {
				if (!checkItemCurrenciesValid(item)) return;
			}
			if (!validateItemsBeforeSave(product.items)) return;
		}

		let licenses: PlanLicenseParams[] | undefined;
		try {
			licenses = getLicenseUpdatePayload({
				persistedLinks: planLicenses,
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Complete the license price before saving",
			);
			return;
		}

		let plans: ReturnType<typeof buildCatalogUpdatePlans>;
		try {
			plans = buildCatalogUpdatePlans({
				baseProduct,
				editedProduct: product,
				features,
				licenses,
				includeContent: contentHasChanges || licenseHasChanges,
				persistedBasePlanId,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to build plan update",
			);
			return;
		}

		if (!isOnboarding && (contentHasChanges || licenseHasChanges)) {
			setSaving(true);
			try {
				const preview = await fetchPreviewUpdateCatalog({
					plans,
				});
				if (catalogPreviewOpensDialog({ preview: preview.plans[0] })) {
					setShowNewVersionDialog(true);
					return;
				}
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to preview plan changes"));
				return;
			} finally {
				setSaving(false);
			}
		}

		setSaving(true);

		if (product.planType === "free" && product.items.some(isFeaturePriceItem)) {
			setProduct({
				...product,
				planType: "paid",
				basePriceType: "usage",
			});
		}

		try {
			await CatalogV2Service.update(axiosInstance, { plans });
			if (licenses) commitLicenseChanges();
			setBaseProduct(product);
			const renamed = Boolean(baseProduct && product.id !== baseProduct.id);
			if (!renamed) await queryRefetch();
			await Promise.all([invalidateProduct(), invalidateProducts()]);
			toast.success("Changes saved successfully");
			if (renamed) navigateTo(`/products/${product.id}`, navigate);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to save plan"));
		}

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		const baseProduct = useProductStore.getState().baseProduct;
		if (baseProduct) {
			setProduct(baseProduct);
		}
		discardAllLicenses();
	};

	if (!hasChanges) return null;
	if (sheetType && !isOnboarding) return null;

	return (
		<PlanEditorBar>
			<p className="text-body whitespace-nowrap truncate">
				You have unsaved changes
			</p>
			<Button
				variant="secondary"
				onClick={handleDiscardClicked}
				disabled={saving}
			>
				Discard
			</Button>
			<ShortcutButton
				metaShortcut="s"
				onClick={handleSaveClicked}
				isLoading={saving}
			>
				{saveButtonText}
			</ShortcutButton>
		</PlanEditorBar>
	);
};
