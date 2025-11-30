import { Button } from "@/components/v2/buttons/Button";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface AttachProductProductPickerProps {
	form: UseAttachProductForm;
}

export function AttachProductProductPicker({
	form,
}: AttachProductProductPickerProps) {
	const { products: allProducts, isLoading } = useProductsQuery();

	if (isLoading) {
		return <div className="text-sm text-t3">Loading products...</div>;
	}

	const activeProducts = allProducts.filter((p) => !p.archived);

	// Group products by group field
	const groupedProducts = activeProducts.reduce(
		(acc, product) => {
			const group = product.group || "Other";
			if (!acc[group]) acc[group] = [];
			acc[group].push(product);
			return acc;
		},
		{} as Record<string, typeof activeProducts>,
	);

	const handleProductSelect = (productId: string) => {
		form.setFieldValue("productId", productId);
	};

	return (
		<div className="space-y-4">
			{Object.entries(groupedProducts).map(([group, products]) => (
				<div key={group} className="space-y-2">
					<div className="text-xs font-medium text-t3">{group}</div>
					<div className="flex gap-2 items-center">
						{products.map((product) => (
							<Button
								key={product.id}
								onClick={() => handleProductSelect(product.id)}
								variant="secondary"
							>
								{product.name}
							</Button>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
