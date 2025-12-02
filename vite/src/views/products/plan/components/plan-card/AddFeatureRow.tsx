import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useCurrentItem,
	useProductStore,
} from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";

interface AddFeatureRowProps {
	disabled?: boolean;
	onClick?: () => void;
}

export const AddFeatureRow = ({ disabled }: AddFeatureRowProps) => {
	const { features } = useFeaturesQuery();
	const setSheet = useSheetStore((s) => s.setSheet);
	const product = useProductStore((s) => s.product);
	const item = useCurrentItem();

	const handleAddFeatureClick = () => {
		// Get feature IDs that are already added to the plan
		const addedFeatureIds = new Set(
			product.items?.map((item) => item.feature_id).filter(Boolean) || [],
		);

		// Filter out features that are already on the plan
		const availableFeatures = features.filter(
			(feature) => !addedFeatureIds.has(feature.id),
		);

		if (availableFeatures.length === 0) {
			// No features available to add (either none exist or all are already added)
			// Go directly to create flow
			setSheet({ type: "new-feature", itemId: "new" });
		} else {
			// Features available to add, open select sheet
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
