import { CreateFeatureSchema } from "@autumn/shared";
import type { AxiosError } from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import {
	SheetFooter,
	SheetHeader,
} from "@/components/v2/sheets/SharedSheetComponents";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@/components/v2/sheets/Sheet";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useFeatureStore } from "@/hooks/stores/useFeatureStore";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { NewFeatureAdvanced } from "../../plan/components/new-feature/NewFeatureAdvanced";
import { NewFeatureBehaviour } from "../../plan/components/new-feature/NewFeatureBehaviour";
import { NewFeatureDetails } from "../../plan/components/new-feature/NewFeatureDetails";
import { NewFeatureType } from "../../plan/components/new-feature/NewFeatureType";
import { getDefaultFeature } from "../utils/defaultFeature";

function CreateFeatureSheet({
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
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
				await FeatureService.createFeature(axiosInstance, {
					name: feature.name,
					id: feature.id,
					type: feature.type,
					config: feature.config,
					event_names: feature.event_names,
				});

				await refetch();
				toast.success("Feature created successfully");
				setOpen(false);
			} catch (error: unknown) {
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
			<SheetTrigger asChild>
				<Button variant="add" className="w-full">
					Feature
				</Button>
			</SheetTrigger>
			<SheetContent className="flex flex-col overflow-hidden">
				<SheetHeader
					title="Create new feature"
					description="Configure how this feature is used in your app"
				/>
				{/* <SheetHeader>
					<SheetTitle>New Feature</SheetTitle>
					<SheetDescription>
						Configure how this feature is used in your app
					</SheetDescription>
				</SheetHeader> */}

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
