import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";

export const CompletionStep = () => {
	const { product } = useProductContext();

	return (
		<SheetSection title="Summary">
			<div className="space-y-3">
				<div>
					<strong>Plan Name:</strong> {product?.name || "N/A"}
				</div>
				<div>
					<strong>Plan ID:</strong> {product?.id || "N/A"}
				</div>
				{product?.description && (
					<div>
						<strong>Description:</strong> {product.description}
					</div>
				)}
				<div className="pt-4 text-sm text-gray-600">
					Click "Finish" to go to your products dashboard.
				</div>
			</div>
		</SheetSection>
	);
};
