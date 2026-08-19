import {
	CreateFeatureSchema,
	FeatureType,
	featureV1ToDbFeature,
} from "@autumn/shared";
import type { AxiosError } from "axios";
import { toast } from "sonner";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetHeader } from "@/components/v2/sheets/InlineSheet";
import { PlanSheetFooter } from "@/components/v2/sheets/PlanSheetFooter";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { getBackendErr } from "@/utils/genUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { validateCreditSystem } from "@/views/products/features/credit-systems/utils/validateCreditSystem";
import { featureToCatalogFeatureParams } from "@/views/products/features/utils/buildFeatureMutationParams";
import { useSaveRestoreFeature } from "../../hooks/useSaveRestoreFeature";
import { getDefaultItem } from "../../utils/getDefaultItem";
import { NewFeatureAdvanced } from "./NewFeatureAdvanced";
import { NewFeatureBehaviour } from "./NewFeatureBehaviour";
import { NewFeatureDetails } from "./NewFeatureDetails";
import { NewFeatureType } from "./NewFeatureType";

export function NewFeatureSheet({ isOnboarding }: { isOnboarding?: boolean }) {
	useSaveRestoreFeature({ enabled: !!isOnboarding });

	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const resetFeature = useFeatureStore((s) => s.reset);
	const { product, setProduct } = useProduct();
	const { setSheet } = useSheet();
	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();

	const isDirty = !!feature.name || !!feature.id || feature.type !== null;

	const handleCreateFeature = async () => {
		if (feature.type === FeatureType.CreditSystem) {
			const validationError = validateCreditSystem(feature);
			if (validationError) {
				toast.error(validationError);
				return;
			}
		}

		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			toast.error("Invalid feature", {
				description: result.error.issues
					.map((issue) => issue.message)
					.join(".\n"),
			});
			return;
		}

		try {
			const response = await updateCatalog({
				features: [featureToCatalogFeatureParams({ feature })],
			});

			const newFeature = response.features.find(
				(candidate) => candidate.id === feature.id,
			);
			if (!product || !newFeature) {
				return;
			}

			const newItem = getDefaultItem({
				feature: featureV1ToDbFeature({ apiFeature: newFeature }),
			});

			const newItems = [...(product.items || []), newItem];
			setProduct({ ...product, items: newItems });

			const itemIndex = newItems.length - 1;
			const itemId = getItemId({ item: newItem, itemIndex });

			setTimeout(() => {
				setSheet({ type: "edit-feature", itemId });
			}, 0);
		} catch (error: unknown) {
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create feature"),
			);
		}
	};

	const handleClose = () => {
		setSheet({ type: "edit-plan" });
	};

	const handleDiscard = () => {
		resetFeature();
	};

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<div className="flex-1 overflow-y-auto overscroll-none [scrollbar-gutter:stable]">
				{!isOnboarding && (
					<SheetHeader
						title="New Feature"
						description="Create a feature to represent what customers on this plan can use. After, you can configure its limits and prices for each plan."
					/>
				)}

				<NewFeatureDetails feature={feature} setFeature={setFeature} />

				<NewFeatureType feature={feature} setFeature={setFeature} />

				<NewFeatureBehaviour feature={feature} setFeature={setFeature} />

				<NewFeatureAdvanced feature={feature} setFeature={setFeature} />
			</div>

			<PlanSheetFooter
				isDirty={isDirty}
				onDiscard={handleDiscard}
				onClose={handleClose}
				onConfirm={handleCreateFeature}
				confirmLabel="Create"
				closeLabel="Cancel"
				isLoading={isPending}
			/>
		</div>
	);
}
