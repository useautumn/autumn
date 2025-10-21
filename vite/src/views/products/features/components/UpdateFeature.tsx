import { FeatureType } from "@autumn/shared";
import { CircleArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	CustomDialogBody,
	CustomDialogContent,
	CustomDialogFooter,
} from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { FeatureService } from "@/services/FeatureService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { FeatureConfig } from "@/views/products/features/components/FeatureConfig";

export default function UpdateFeature({
	open,
	setOpen,
	selectedFeature,
	setSelectedFeature,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedFeature: any;
	setSelectedFeature: (feature: any) => void;
}) {
	const { refetch } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();
	const [updateLoading, setUpdateLoading] = useState(false);
	const [eventNameInput, setEventNameInput] = useState("");
	const [eventNameChanged, setEventNameChanged] = useState(true);

	const originalFeature = useRef(selectedFeature);

	useEffect(() => {
		if (open) {
			originalFeature.current = selectedFeature;
		}
	}, [open, selectedFeature]);

	useEffect(() => {
		if (open) {
			setEventNameInput("");
			setEventNameChanged(true);
		}
	}, [open]);

	const updateConfig = () => {
		const config: any = structuredClone(selectedFeature.config);
		return config;
	};

	const getEventNames = () => {
		const eventNames = selectedFeature.event_names || [];
		if (
			selectedFeature.type === FeatureType.Metered &&
			eventNameInput.trim() &&
			eventNames.length === 0
		) {
			return [eventNameInput.trim()];
		}
		return eventNames;
	};

	const handleUpdateFeature = async () => {
		setUpdateLoading(true);
		const originalId = originalFeature.current.id;

		try {
			await FeatureService.updateFeature(axiosInstance, originalId, {
				...selectedFeature,
				id: selectedFeature.id,
				type: selectedFeature.type,
				name: selectedFeature.name,
				config: updateConfig(),
				event_names: getEventNames(),
			});

			await refetch();
			setOpen(false);
		} catch (error) {
			console.log(error);
			toast.error(getBackendErr(error, "Failed to update feature"));
		}
		setUpdateLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<CustomDialogContent>
				<CustomDialogBody className="overflow-y-auto">
					<DialogTitle>Update Feature</DialogTitle>

					<FeatureConfig
						feature={selectedFeature}
						setFeature={setSelectedFeature}
						eventNameInput={eventNameInput}
						setEventNameInput={setEventNameInput}
						isUpdate={true}
						eventNameChanged={eventNameChanged}
						setEventNameChanged={setEventNameChanged}
						open={open}
					/>
				</CustomDialogBody>
				<CustomDialogFooter>
					<Button
						isLoading={updateLoading}
						onClick={() => handleUpdateFeature()}
						variant="add"
						startIcon={<CircleArrowUp size={14} />}
					>
						Update Feature
					</Button>
				</CustomDialogFooter>
			</CustomDialogContent>
		</Dialog>
	);
}
