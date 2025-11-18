import { FeatureType } from "@autumn/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { CreateCreditSystemSheet } from "../credit-systems/components/CreateCreditSystemSheet";

export function CreditListCreateButton() {
	const [open, setOpen] = useState(false);
	const { features } = useFeaturesQuery();

	const handleClick = () => {
		// Check if there's at least one metered feature (non-archived)
		const hasMeteredFeature = features?.some(
			(feature) => feature.type === FeatureType.Metered && !feature.archived,
		);

		if (!hasMeteredFeature) {
			toast.error(
				"Please create at least 1 metered feature before creating a credit system",
			);
			return;
		}

		setOpen(true);
	};

	return (
		<>
			<CreateCreditSystemSheet open={open} onOpenChange={setOpen} />
			<Button variant="primary" size="default" onClick={handleClick}>
				Create Credit System
			</Button>
		</>
	);
}
