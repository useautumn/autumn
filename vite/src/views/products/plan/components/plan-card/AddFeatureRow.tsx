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
			variant="dotted"
			className="group w-full !h-8 bg-[#FDFDFC] hover:!border-neutral-300 hover:!border-dashed hover:text-primary [&:hover_svg]:text-primary"
			disabled={disabled}
			onClick={handleAddFeatureClick}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3" weight="bold" />
			<span className="group-hover:text-primary">Add Feature</span>
		</Button>
	);
};
