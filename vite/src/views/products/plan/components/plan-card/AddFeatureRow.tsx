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
			className="group input-base input-shadow-tiny input-state-open-tiny w-full !h-8 !bg-[#FDFDFC] !border-dashed !text-primary [&_svg]:text-primary hover:!border-solid hover:!border-primary [&:not(:hover)]:!border-neutral-300 active:!bg-[#FDFDFC] active:!border-dashed focus-visible:!bg-[#FDFDFC] focus-visible:!border-dashed [data-state='open']:!bg-[#FDFDFC]"
			disabled={disabled}
			onClick={handleAddFeatureClick}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3 !text-primary" weight="bold" />
			<span className="!text-primary">Add Feature</span>
		</Button>
	);
};
