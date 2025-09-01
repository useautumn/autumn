import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useProductContext } from "../../../ProductContext";
import { useProductItemContext } from "../../ProductItemContext";

export const AddToEntityDropdown = () => {
	const { product, entityFeatureIds } = useProductContext();
	const { item, handleCreateProductItem } = useProductItemContext();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="add"
					className="w-fit"
					disabled={!item.feature_id && !item.price}
				>
					Add Item
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-fit min-w-40 p-0" align="start">
				<div className="flex flex-col gap-1">
					<Button
						variant="ghost"
						className="justify-start"
						onClick={() => {
							// setItem({
							//   ...item,
							//   entity_feature_id: product.name,
							// });
							handleCreateProductItem(null);
						}}
					>
						{product.name} (Product)
					</Button>
					{entityFeatureIds.map((entityFeatureId: string) => (
						<Button
							key={entityFeatureId}
							variant="ghost"
							className="justify-start"
							onClick={() => {
								// setItem({
								//   ...item,
								//   entity_feature_id: entityFeatureId,
								// });
								handleCreateProductItem(entityFeatureId);
							}}
						>
							{entityFeatureId} (Entity)
						</Button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
};
