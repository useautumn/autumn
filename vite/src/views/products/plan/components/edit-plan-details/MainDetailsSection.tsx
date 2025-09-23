import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";

export const MainDetailsSection = () => {
	const { product, setProduct } = useProductContext();

	return (
		<SheetSection title="Plan Details">
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="eg. Pro Plan"
							value={product.name}
							onChange={(e) => setProduct({ ...product, name: e.target.value })}
						/>
					</div>
					<div>
						<FormLabel>ID</FormLabel>
						<Input
							placeholder="fills automatically"
							disabled
							value={product.id}
						/>
					</div>
				</div>
				<div>
					<div className="text-form-label block mb-1">Description</div>
					<Input
						placeholder="eg. This plan includes 100 credits"
						value={product.description}
						onChange={(e) =>
							setProduct({ ...product, description: e.target.value })
						}
					/>
				</div>
			</div>
		</SheetSection>
	);
};
