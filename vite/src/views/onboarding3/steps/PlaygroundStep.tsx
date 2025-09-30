import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { useProductContext } from "@/views/products/product/ProductContext";

interface PlaygroundStepProps {
	onProductCreated?: () => void;
}

export const PlaygroundStep = ({
	onProductCreated: _,
}: PlaygroundStepProps) => {
	const { product: contextProduct } = useProductContext();
	const { products } = useProductsQuery();

	// Check if product has been created (has internal_id or exists in products list)
	const _productExists =
		contextProduct?.internal_id ||
		contextProduct?.org_id ||
		products?.some((p) => p.id === contextProduct?.id) ||
		false;

	return (
		<div className="flex flex-col gap-4 p-4">
			<div className="text-sm text-muted-foreground">
				🎉 Great! You've created your first plan with a feature.
			</div>
			<div className="text-sm text-muted-foreground">
				Use the "Save Changes" button below to save your plan, or create
				additional plans using the button above.
			</div>
		</div>
	);
};
