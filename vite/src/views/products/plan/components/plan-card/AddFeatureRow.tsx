import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import {
	useCurrentItem,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";

interface AddFeatureRowProps {
	disabled?: boolean;
	onClick?: () => void;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const { setSheet } = useSheet();
	const { product } = useProduct();
	const item = useCurrentItem();

	const handleAddFeatureClick = () => {
		const addedFeatureIds = new Set(
			product.items?.map((item) => item.feature_id).filter(Boolean) || [],
		);

		const availableFeatures = features.filter(
			(feature) => !addedFeatureIds.has(feature.id),
		);

		if (availableFeatures.length === 0) {
			setSheet({ type: "new-feature", itemId: "new" });
		} else {
			setSheet({ type: "select-feature", itemId: "select" });
		}
	};

	return (
		<Button
			variant="dotted"
			className="group !rounded-xl !bg-transparent w-full !h-9 !border-dashed !text-primary [&_svg]:text-primary hover:!border-primary !border-primary/50 active:!border-primary focus-visible:!bg-[#FDFDFC] focus-visible:!border-dashed [data-state='open']:!bg-[#FDFDFC] disabled:relative z-95 hover:relative"
			disabled={disabled}
			onClick={() => {
				if (!checkItemIsValid(item!)) return;
				handleAddFeatureClick();
			}}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3 !text-primary" weight="bold" />
			<span className="!text-primary">Add Feature to Plan</span>
		</Button>
	);
};
