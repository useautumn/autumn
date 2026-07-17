import {
	isFeaturePriceItem,
	type PlanLicenseParams,
	type PlanUpdatePreview,
} from "@autumn/shared";
import { Button, ShortcutButton } from "@autumn/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useOrg } from "@/hooks/common/useOrg";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFetchPlanUpdatePreview } from "@/hooks/queries/usePlanUpdatePreview";
import { usePlanVariants } from "@/hooks/queries/usePlanVariants";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import {
	useHasChanges,
	useIsCusPlanEditor,
	useIsMetadataOnlyChange,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useProductQuery } from "../../product/hooks/useProductQuery";
import { useProductContext } from "../../product/ProductContext";
import { updateProduct } from "../../product/utils/updateProduct";
import { checkItemCurrenciesValid } from "../utils/currencyUtils";
import { buildPreviewUpdatePlanParams } from "../versioning/buildMigrationDraft";
import { PlanEditorBar } from "./PlanEditorBar";
import {
	discardAllLicenses,
	getLicenseUpdatePayload,
	saveAllLicenses,
	useHasLicenseChanges,
} from "./plan-licenses/useLicenseSaveRegistry";

interface SaveChangesBarProps {
	isOnboarding?: boolean;
}

const previewHasParentCustomers = (preview: PlanUpdatePreview) =>
	preview.has_customers ||
	(preview.other_versions ?? []).some((version) => version.has_customers);

export const SaveChangesBar = ({
	isOnboarding = false,
}: SaveChangesBarProps) => {
	const axiosInstance = useAxiosInstance();
	const { org } = useOrg();
	const { setShowNewVersionDialog, catalogLicenses } = useProductContext();

	// Get product state from store
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setProduct = useProductStore((s) => s.setProduct);
	const { type: sheetType } = useSheetStore();
	const planHasChanges = useHasChanges();
	const licenseHasChanges = useHasLicenseChanges();
	const hasChanges = planHasChanges || licenseHasChanges;
	const planLicenses = catalogLicenses.map(({ planLicense }) => planLicense);
	const { features = [] } = useFeaturesQuery();
	const fetchPlanUpdatePreview = useFetchPlanUpdatePreview();

	const [saving, setSaving] = useState(false);

	const { invalidate: invalidateProducts } = useProductsQuery();
	const { refetch: queryRefetch, invalidate: invalidateProduct } =
		useProductQuery();

	const isCusPlanEditor = useIsCusPlanEditor();
	const isMetadataOnlyChange = useIsMetadataOnlyChange();
	let saveButtonText = "Save";
	if (isCusPlanEditor) {
		saveButtonText = "Save and Return";
	}

	const { data: variants = [] } = usePlanVariants(
		product.id,
		hasChanges && !isOnboarding,
	);

	const handleSaveClicked = async () => {
		for (const item of product.items) {
			if (!checkItemCurrenciesValid(item)) return;
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

		if (!isOnboarding && hasChanges) {
			let preview: PlanUpdatePreview;
			setSaving(true);
			try {
				preview = await fetchPlanUpdatePreview({
					planId: product.id,
					params: buildPreviewUpdatePlanParams({
						baseProduct,
						editedProduct: product,
						features,
						licenses,
					}),
				});
			} catch (error) {
				toast.error(getBackendErr(error, "Failed to preview plan changes"));
				return;
			} finally {
				setSaving(false);
			}

			const needsVersionChoice =
				licenseHasChanges || (planHasChanges && !isMetadataOnlyChange);
			const hasCustomers =
				previewHasParentCustomers(preview) && needsVersionChoice;
			if (hasCustomers || (planHasChanges && variants.length > 0)) {
				setShowNewVersionDialog(true);
				return;
			}
		}

		setSaving(true);

		// If the plan type is free and user is adding a priced feature, set plan to usage-based
		if (product.planType === "free" && product.items.some(isFeaturePriceItem)) {
			setProduct({
				...product,
				planType: "paid",
				basePriceType: "usage",
			});
		}

		const planSaved = planHasChanges
			? await updateProduct({
					axiosInstance,
					productId: product.id,
					product,
					version: product.version,
					orgCurrency: org?.default_currency,
					onSuccess: async () => {
						await queryRefetch();
						await Promise.all([invalidateProduct(), invalidateProducts()]);
					},
				})
			: true;
		const licensesSaved = planSaved
			? await saveAllLicenses({
					axiosInstance,
					parentPlanId: product.id,
					persistedLinks: planLicenses,
					onSuccess: () =>
						Promise.all([invalidateProduct(), invalidateProducts()]),
				})
			: false;

		// License failures already toast their own error, so only the combined
		// success gets a toast here.
		if (planSaved && licensesSaved) {
			toast.success("Changes saved successfully");
		}

		setSaving(false);
	};

	const handleDiscardClicked = () => {
		const baseProduct = useProductStore.getState().baseProduct;
		if (baseProduct) {
			setProduct(baseProduct);
		}
		discardAllLicenses();
		// If we're editing or creating a feature, go back to edit-plan
		// if (sheetType === "edit-feature" || sheetType === "new-feature") {
		// 	setSheet({ type: "edit-plan", itemId: null });
		// }
	};

	if (!hasChanges) return null;
	//hide if sheet is open
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
