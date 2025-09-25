import { LongCheckbox } from "@/components/v2/checkboxes/LongCheckbox";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductContext } from "@/views/products/product/ProductContext";

export const AdditionalOptions = () => {
	const { product, setProduct } = useProductContext();

	if (!product) return null;

	return (
		<SheetSection title="Additional Options">
			<div className="space-y-4">
				<LongCheckbox
					title="Default"
					subtitle="This product will be enabled by default for all new users,
                        typically used for your free plan"
					checked={product.is_default}
					onCheckedChange={(checked) =>
						setProduct({ ...product, is_default: checked })
					}
				/>
				<LongCheckbox
					title="Add On"
					subtitle="This product is an add-on that can be bought together with your
                        base products (eg, top ups)"
					checked={product.is_add_on}
					onCheckedChange={(checked) =>
						setProduct({ ...product, is_add_on: checked })
					}
				/>
			</div>
		</SheetSection>
	);
};
