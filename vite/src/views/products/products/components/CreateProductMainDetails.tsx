import { FormLabel, Input } from "@autumn/ui";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";

export const CreateProductMainDetails = () => {
	// Context-first (the create sheet's local draft); falls back to the store
	// on pages without a ProductProvider.
	const { product, setProduct } = useProduct();

	const { setSource, setTarget } = useAutoSlug({
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
	});

	return (
		<SheetSection>
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Plan Name</FormLabel>
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
