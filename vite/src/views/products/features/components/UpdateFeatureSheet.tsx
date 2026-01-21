import { type Feature, FeatureUsageType } from "@autumn/shared";
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

interface UpdateFeatureSheetProps {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedFeature: Feature | null;
	onSuccess?: (oldId: string, newId: string) => void;
}

function UpdateFeatureSheet({
	open,
	setOpen,
	selectedFeature,
	onSuccess,
}: UpdateFeatureSheetProps) {
	const [loading, setLoading] = useState(false);

	const feature = useFeatureStore((s) => s.feature);
	const setFeature = useFeatureStore((s) => s.setFeature);
	const setBaseFeature = useFeatureStore((s) => s.setBaseFeature);

	const axiosInstance = useAxiosInstance();
	const { refetch } = useFeaturesQuery();

	// Initialize feature store when selectedFeature changes
	useEffect(() => {
		if (open && selectedFeature) {
			setFeature(selectedFeature);
			setBaseFeature(selectedFeature);
		}
	}, [open, selectedFeature, setFeature, setBaseFeature]);

	const handleUpdateFeature = async () => {
		if (!selectedFeature) return;

		setLoading(true);
		try {
			await FeatureService.updateFeature(axiosInstance, selectedFeature.id, {
				...feature,
				id: feature.id || undefined,
				name: feature.name || undefined,
				type: feature.type,
				consumable: feature.config?.usage_type === FeatureUsageType.Single,
				event_names: feature.event_names,
				display: undefined,
			});

			await refetch();
			toast.success("Feature updated successfully");

			// Call onSuccess with old and new IDs, if it's updated from the plan editor to update the plan items.
			if (onSuccess) {
				onSuccess(selectedFeature.id, feature.id);
			}

			setOpen(false);
		} catch (error: unknown) {
			console.log(error);
			toast.error(
				getBackendErr(error as AxiosError, "Failed to update feature"),
			);
		} finally {
			setLoading(false);
		}
	};

	const handleCancel = () => {
		setOpen(false);
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Update Feature"
					description="Modify how this feature is used in your app"
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
						onClick={handleUpdateFeature}
						metaShortcut="enter"
						isLoading={loading}
					>
						Update feature
					</ShortcutButton>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}

export default UpdateFeatureSheet;
