import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductContext } from "@/views/products/product/ProductContext";

interface AddFeatureRowProps {
	disabled?: boolean;
	onClick?: () => void;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const { setSheet, setEditingState } = useProductContext();

	const handleAddFeatureClick = () => {
		if (features.length === 0) {
			// No features exist, go directly to create flow
			setEditingState({ type: "feature", id: "new" });
			setSheet("new-feature");
		} else {
			// Features exist, open select sheet
			setEditingState({ type: "feature", id: "select" });
			setSheet("select-feature");
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
