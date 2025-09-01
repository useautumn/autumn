import { Infinite } from "@autumn/shared";
import { Button } from "@/components/ui/button";
import { isPriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "../../ProductItemContext";

export const AddFeatureButton = () => {
	// Show add feature button if current item is fixedPrice
	const { item, setItem, isUpdate, show, setShow } = useProductItemContext();

	const showAddFeature = isPriceItem(item);

	if (!showAddFeature || isUpdate) return null;

	return (
		<Button
			className={
				"!h-full text-t2"
				// "w-0 max-w-0 p-0 overflow-hidden transition-all duration-200 ease-in-out -ml-2",
				// !show.feature && !isUpdate
				//   ? "w-full max-w-32 mr-0 p-2"
				//   : "w-0 max-w-0 p-0 border-none",
			}
			variant="add"
			onClick={() => {
				// setShow({
				//   ...show,
				//   feature: true,
				//   price: item.price > 0 ? true : false,
				// });
				setItem({
					...item,
					tiers: item.price
						? [
								{
									to: Infinite,
									amount: item.price ?? 0,
								},
							]
						: null,
				});
			}}
		>
			Add Feature
		</Button>
	);
};
