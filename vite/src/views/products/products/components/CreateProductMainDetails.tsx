import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const CreateProductMainDetails = () => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const { setSource, setTarget } = useAutoSlug({
		state: product,
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
	});

	return (
		<SheetSection title="Plan Details">
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="eg. Pro Plan"
							value={product.name}
							onChange={(e) => setSource(e.target.value)}
						/>
					</div>
					<div>
						<FormLabel>ID</FormLabel>
						<Input
							placeholder="fills automatically"
							value={product.id}
							onChange={(e) => setTarget(e.target.value)}
						/>
					</div>
				</div>
			</div>
		</SheetSection>
	);
};
