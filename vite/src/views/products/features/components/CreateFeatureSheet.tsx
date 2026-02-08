import {
	CreateFeatureSchema,
	type CreditSchemaItem,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import { Sheet, SheetContent } from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { NewFeatureAdvanced } from "../../plan/components/new-feature/NewFeatureAdvanced";
import { NewFeatureBehaviour } from "../../plan/components/new-feature/NewFeatureBehaviour";
import { NewFeatureDetails } from "../../plan/components/new-feature/NewFeatureDetails";
import { NewFeatureType } from "../../plan/components/new-feature/NewFeatureType";
import { validateCreditSystem } from "../credit-systems/utils/validateCreditSystem";
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
	const [loading, setLoading] = useState(false);
	const [internalOpen, setInternalOpen] = useState(false);

	const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
	const setOpen = controlledOnOpenChange || setInternalOpen;

	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const reset = useFeatureStore((s) => s.reset);

	const axiosInstance = useAxiosInstance();

	const { refetch } = useFeaturesQuery();

	const handleCreateFeature = async () => {
		// Validate credit system specific fields first
		if (feature.type === FeatureType.CreditSystem) {
			const validationError = validateCreditSystem(feature);
			if (validationError) {
				toast.error(validationError);
				return;
			}
		}

		setLoading(true);
		const result = CreateFeatureSchema.safeParse(feature);
		if (result.error) {
			console.log(result.error.issues);
			toast.error("Invalid feature", {
				description: result.error.issues.map((x) => x.message).join(".\n"),
			});
			setLoading(false);
		} else {
			try {
				const { data: createdFeature } = await FeatureService.createFeature(
					axiosInstance,
					{
						name: feature.name,
						id: feature.id,
						type: feature.type,
						consumable: feature.config?.usage_type === FeatureUsageType.Single,
						credit_schema: feature.config?.schema?.map(
							(x: CreditSchemaItem) => ({
								metered_feature_id: x.metered_feature_id,
								credit_cost: x.credit_amount,
							}),
						),
						event_names: feature.event_names,
					},
				);

				await refetch();
				toast.success("Feature created successfully");
				setOpen(false);

				if (onSuccess && createdFeature.id) {
					onSuccess(createdFeature.id);
				}
			} catch (error: unknown) {
				console.error("Error creating feature", error);
				toast.error(
					getBackendErr(error as AxiosError, "Failed to create feature"),
				);
			} finally {
				setLoading(false);
			}
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
			{/* {!isControlled && (
				<SheetTrigger asChild>
					<Button variant="add" className="w-full">
						Feature
					</Button>
				</SheetTrigger>
			)} */}
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
						isLoading={loading}
					>
						Create feature
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default CreateFeatureSheet;
