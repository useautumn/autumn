import type { AnyFieldApi } from "@tanstack/react-form";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/v2/buttons/Button";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import type { ProductFormItem } from "./attach-product-form-schema";
import type { UseAttachProductForm } from "./use-attach-product-form";

interface AttachProductSelectionProps {
	field: AnyFieldApi;
	form: UseAttachProductForm;
}

export function AttachProductSelection({
	field,
	form,
}: AttachProductSelectionProps) {
	const { products } = useProductsQuery();
	const activeProducts = products.filter((p) => !p.archived);

	const selectedProductIds = field.state.value
		.map((item: { productId: string }) => item.productId)
		.filter(Boolean);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-[1fr_auto] gap-2">
				<div className="text-form-label text-sm font-medium">Product</div>
				<div className="grid grid-cols-[auto_auto] gap-2">
					<div className="text-form-label text-sm font-medium w-32 pl-2">
						Quantity
					</div>
					<div className="w-[42px]" />
				</div>
			</div>

			<div className="space-y-2">
				{form.state.values.products.map((item: ProductFormItem, i: number) => {
					const availableProducts = activeProducts.filter(
						(p) =>
							!selectedProductIds.includes(p.id) ||
							field.state.value[i]?.productId === p.id,
					);

					return (
						<div
							key={item.productId}
							className="grid grid-cols-[1fr_auto] gap-2"
						>
							<form.AppField name={`products[${i}].productId`}>
								{(subField) => (
									<subField.SelectField
										label=""
										options={availableProducts.map((p) => ({
											label: p.name,
											value: p.id,
										}))}
										placeholder="Select Product"
									/>
								)}
							</form.AppField>

							<div className="flex items-center gap-2">
								<form.AppField name={`products[${i}].quantity`}>
									{(subField) => (
										<subField.QuantityField label="" placeholder="1" min={1} />
									)}
								</form.AppField>

								<Button
									size="sm"
									variant="secondary"
									className="h-input px-3 disabled:pointer-events-none disabled:opacity-50"
									onClick={() => {
										if (field.state.value.length === 1) {
											return;
										}
										field.removeValue(i);
									}}
									disabled={field.state.value.length === 1}
									type="button"
									aria-label="Remove product"
								>
									<X size={14} />
								</Button>
							</div>
						</div>
					);
				})}
			</div>

			<Button
				variant="muted"
				size="sm"
				onClick={() =>
					field.pushValue({
						productId: "",
						quantity: 1,
					})
				}
				type="button"
				className="w-full"
			>
				<Plus size={14} />
				Add Product
			</Button>
		</div>
	);
}
