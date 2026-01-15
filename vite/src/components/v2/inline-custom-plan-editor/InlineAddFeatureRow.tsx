import { productV2ToFeatureItems } from "@autumn/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { getItemId } from "@/utils/product/productItemUtils";
import { useInlineEditorContext } from "./InlineEditorContext";

export function InlineAddFeatureRow({ disabled }: { disabled?: boolean }) {
	const { features } = useFeaturesQuery();
	const { product, setSheet, itemId } = useInlineEditorContext();

	// Get current item for validation
	const featureItems = productV2ToFeatureItems({ items: product.items });
	const currentItem = featureItems.find((item) => {
		const actualIndex = product.items?.indexOf(item) ?? -1;
		const currentItemId = getItemId({ item, itemIndex: actualIndex });
		return itemId === currentItemId;
	});

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
			className="group rounded-xl! bg-transparent! w-full h-9! border-dashed! text-primary! [&_svg]:text-primary hover:border-primary! border-primary/50! active:border-primary! focus-visible:bg-[#FDFDFC]! focus-visible:border-dashed! [data-state='open']:bg-[#FDFDFC]! disabled:relative z-95 hover:relative"
			disabled={disabled}
			onClick={() => {
				if (currentItem && !checkItemIsValid(currentItem)) return;
				handleAddFeatureClick();
			}}
			aria-label="Add new feature"
		>
			<PlusIcon className="size-3 text-primary!" weight="bold" />
			<span className="text-primary!">Add Feature to Plan</span>
		</Button>
	);
}
