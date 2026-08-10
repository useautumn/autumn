import { CreateFeatureSchema, isAnyCreditSystem } from "@autumn/shared";
import { Sheet, SheetContent, ShortcutButton } from "@autumn/ui";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { useUpdateCatalogMutation } from "@/hooks/queries/catalog/useUpdateCatalogMutation";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { getBackendErr } from "@/utils/genUtils";
import { NewFeatureAdvanced } from "../../plan/components/new-feature/NewFeatureAdvanced";
import { NewFeatureBehaviour } from "../../plan/components/new-feature/NewFeatureBehaviour";
import { NewFeatureDetails } from "../../plan/components/new-feature/NewFeatureDetails";
import { NewFeatureType } from "../../plan/components/new-feature/NewFeatureType";
import { validateCreditSystem } from "../credit-systems/utils/validateCreditSystem";
import { featureToCatalogFeatureParams } from "../utils/buildFeatureMutationParams";
import { getDefaultFeature } from "../utils/defaultFeature";

function CreateFeatureSheet({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	onSuccess,
	isControlled = false,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: (featureId: string) => void;
	isControlled?: boolean;
} = {}) {
	const [internalOpen, setInternalOpen] = useState(false);

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = controlledOnOpenChange || setInternalOpen;

	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const reset = useFeatureStore((s) => s.reset);

	const { mutateAsync: updateCatalog, isPending } = useUpdateCatalogMutation();

	const handleCreateFeature = async () => {
		// Validate credit system specific fields first
		if (isAnyCreditSystem(feature.type)) {
			const validationError = validateCreditSystem(feature);
			if (validationError) {
				toast.error(validationError);
				return;
			}
		}

		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			console.log(result.error.issues);
			toast.error("Invalid feature", {
				description: result.error.issues.map((x) => x.message).join(".\n"),
			});
			return;
		}

		try {
			await updateCatalog({
				features: [featureToCatalogFeatureParams({ feature })],
			});

			toast.success("Feature created successfully");
			setOpen(false);

			if (onSuccess && feature.id) {
				onSuccess(feature.id);
			}
		} catch (error: unknown) {
			console.error("Error creating feature", error);
			toast.error(
				getBackendErr(error as AxiosError, "Failed to create feature"),
			);
		}
	};

	const handleCancel = () => {
		setOpen(false);
	};

	// Reset feature state when sheet opens/closes
	useEffect(() => {
		if (open) {
			reset();
			setFeature(getDefaultFeature());
		}
	}, [open, reset, setFeature]);

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create a feature"
					description="Create a feature to control based on a customer's plan."
				/>

				<div className="flex-1 overflow-y-auto">
					<NewFeatureDetails feature={feature} setFeature={setFeature} />
					<NewFeatureType feature={feature} setFeature={setFeature} />
					<NewFeatureBehaviour feature={feature} setFeature={setFeature} />
					<NewFeatureAdvanced feature={feature} setFeature={setFeature} />
				</div>

				<SheetFooter>
					<ShortcutButton
						variant="secondary"
						className="w-full"
						onClick={handleCancel}
						singleShortcut="escape"
					>
						Cancel
					</ShortcutButton>
					<ShortcutButton
						className="w-full"
						onClick={handleCreateFeature}
						metaShortcut="enter"
						isLoading={isPending}
					>
						Create feature
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateFeatureSheet;
