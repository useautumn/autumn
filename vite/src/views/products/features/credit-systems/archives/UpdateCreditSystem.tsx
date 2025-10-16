import type { CreateFeature } from "@autumn/shared";
import { useState } from "react";
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
import CreditSystemConfig from "./CreditSystemConfig";
import { validateCreditSystem } from "./utils/validateCreditSystem";

function UpdateCreditSystem({
	open,
	setOpen,
	selectedCreditSystem,
	setSelectedCreditSystem,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	selectedCreditSystem: CreateFeature;
	setSelectedCreditSystem: (creditSystem: CreateFeature) => void;
}) {
	const [updateLoading, setUpdateLoading] = useState(false);
	const { refetch } = useFeaturesQuery();
	const axiosInstance = useAxiosInstance();

	const handleUpdateCreditSystem = async () => {
		const validationError = validateCreditSystem(selectedCreditSystem);
		if (validationError) {
			toast.error(validationError);
			return;
		}

		setUpdateLoading(true);
		try {
			await FeatureService.updateFeature(
				axiosInstance,
				selectedCreditSystem.id,
				{
					...selectedCreditSystem,
				},
			);
			await refetch();
			setOpen(false);
		} catch (error) {
			toast.error(getBackendErr(error, "Failed to update credit system"));
		}
		setUpdateLoading(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<CustomDialogContent className="w-[500px]  overflow-y-auto max-h-[500px]">
				<CustomDialogBody>
					<DialogTitle>Update Credit System</DialogTitle>

					<CreditSystemConfig
						creditSystem={selectedCreditSystem}
						setCreditSystem={setSelectedCreditSystem}
					/>
				</CustomDialogBody>

				<CustomDialogFooter>
					<Button
						isLoading={updateLoading}
						onClick={() => handleUpdateCreditSystem()}
						variant="add"
					>
						Update
					</Button>
				</CustomDialogFooter>
			</CustomDialogContent>
		</Dialog>
	);
}

export default UpdateCreditSystem;
