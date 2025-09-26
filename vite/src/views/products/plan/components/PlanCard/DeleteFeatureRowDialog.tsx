import type { ProductItem } from "@autumn/shared";
import { Button } from "@/components/v2/buttons/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useProductContext } from "@/views/products/product/ProductContext";

export const DeleteFeatureRowDialog = ({
	open,
	setOpen,
	item,
	onDelete,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	item: ProductItem;
	onDelete: (item: ProductItem) => void;
}) => {
	const { features } = useFeaturesQuery();
	const { product } = useProductContext();
	const featureName = features.find((f) => f.id === item.feature_id)?.name;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-sm">
				<DialogHeader>
					<DialogTitle>Delete "{featureName}"</DialogTitle>
					<DialogDescription>
						Please confirm that you want to delete this feature.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="secondary" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button variant="destructive" onClick={() => setOpen(false)}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
