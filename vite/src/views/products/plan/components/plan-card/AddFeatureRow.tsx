import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";

interface AddFeatureRowProps {
	disabled?: boolean;
	onClick?: () => void;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const setSheet = useSheetStore((s) => s.setSheet);

	const handleAddFeatureClick = () => {
		if (features.length === 0) {
			// No features exist, go directly to create flow
			setSheet({ type: "new-feature", itemId: "new" });
		} else {
			// Features exist, open select sheet
			setSheet({ type: "select-feature", itemId: "select" });
		}
	};

	return (
		<Button
			variant="secondary"
			className="w-full !h-8"
			disabled={disabled}
			onClick={handleAddFeatureClick}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3" weight="bold" />
		</Button>
	);
};
