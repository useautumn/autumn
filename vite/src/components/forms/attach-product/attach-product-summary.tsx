import type { ProductV2 } from "@autumn/shared";

export function AttachProductSummary({
	selectedProducts,
	products,
}: {
	selectedProducts: { productId: string; quantity: number }[];
	products: ProductV2[];
}) {
	const lineItems = selectedProducts
		.filter((item) => item.productId)
		.map((item) => {
			const product = products.find((p) => p.id === item.productId);
			if (!product) return null;

			const productPrice =
				product.items?.reduce((sum, productItem) => {
					return sum + (productItem.price || 0);
				}, 0) || 0;

			const lineTotal = productPrice * item.quantity;

			return {
				name: product.name,
				quantity: item.quantity,
				unitPrice: productPrice,
				total: lineTotal,
			};
		})
		.filter(Boolean);

	const total = lineItems.reduce((sum, item) => sum + (item?.total || 0), 0);

	if (lineItems.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			<div className="space-y-2">
				{lineItems.map((item, index) => (
					<div key={index} className="flex items-center justify-between">
						<div className="text-sm text-foreground">
							{item?.name}
							{item && item.quantity > 1 && (
								<span className="text-t3"> x{item.quantity}</span>
							)}
						</div>
						<div className="text-sm text-foreground">
							${((item?.total || 0) / 100).toFixed(2)}
						</div>
					</div>
				))}
			</div>

			<div className="border-t border-border" />

			<div className="flex items-center justify-between">
				<div className="text-sm font-semibold text-foreground">Total:</div>
				<div className="text-sm font-semibold text-foreground">
					${(total / 100).toFixed(2)}
				</div>
			</div>
		</div>
	);
}
