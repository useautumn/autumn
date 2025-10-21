import { FreeTrialDuration } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { handleAutoSave } from "@/views/onboarding2/model-pricing/model-pricing-utils/modelPricingUtils";
import { useProductContext } from "../ProductContext";
// import { FrontendFreeTrial } from "@autumn/shared";
import { FreeTrialConfig } from "./FreeTrialConfig";

export const CreateFreeTrial = ({
	open,
	setOpen,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
}) => {
	const [loading] = useState(false);
	const { product, setProduct, autoSave, refetch } = useProductContext();

	const axiosInstance = useAxiosInstance();

	const [freeTrial, setFreeTrial] = useState({
		length: 7,
		unique_fingerprint: false,
		duration: FreeTrialDuration.Day,
		card_required: true,
	});

	const handleCreateFreeTrial = async () => {
		const lengthInt = parseInt(freeTrial.length as any);
		if (isNaN(lengthInt)) {
			toast.error("Invalid length");
			return;
		}

		setProduct({
			...product,
			free_trial: {
				length: lengthInt,
				unique_fingerprint: freeTrial.unique_fingerprint,
				duration: freeTrial.duration,
				card_required: freeTrial.card_required,
			},
		});
		if (autoSave) {
			handleAutoSave({
				axiosInstance,
				productId: product.id,
				product: {
					...product,
					free_trial: {
						length: lengthInt,
						unique_fingerprint: freeTrial.unique_fingerprint,
						duration: freeTrial.duration,
						card_required: freeTrial.card_required,
					},
				},
				refetch,
			});
		}
		setOpen(false);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent>
				<DialogTitle>Create Free Trial</DialogTitle>

				<FreeTrialConfig freeTrial={freeTrial} setFreeTrial={setFreeTrial} />

				<DialogFooter>
					<Button
						onClick={handleCreateFreeTrial}
						isLoading={loading}
						variant="gradientPrimary"
					>
						Create Free Trial
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
