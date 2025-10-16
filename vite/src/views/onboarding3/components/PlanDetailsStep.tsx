import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { BasePriceSection } from "../../products/plan/components/edit-plan-details/BasePriceSection";

export const PlanDetailsStep = () => {
	// Get product state from ProductContext (working copy being edited)
	const product = useProductStore((s) => s.product);
	const baseProduct = useProductStore((s) => s.baseProduct);
	const setProduct = useProductStore((s) => s.setProduct);

	// Check if product already exists on backend (has internal_id from database)
	const isExistingProduct = !!baseProduct?.internal_id;

	const { setSource, setTarget } = useAutoSlug({
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
		disableAutoSlug: isExistingProduct,
	});

	return (
		<>
			<SheetSection title="Product Details">
				<div className="space-y-4">
					<div className="grid grid-cols-1 gap-4">
						<div>
							<FormLabel>Name</FormLabel>
							<Input
								placeholder="eg. Pro"
								value={product?.name || ""}
								onChange={(e) => setSource(e.target.value)}
								className="mb-1"
							/>

							<span className="text-form-label block">
								The display name of the product that will show up on your
								checkout page
							</span>
						</div>
						<div>
							<FormLabel>ID</FormLabel>
							<Input
								placeholder="eg. pro_product"
								value={product?.id || ""}
								onChange={(e) => setTarget(e.target.value)}
								className="mb-1"
							/>
							<span className="text-form-label block">
								A fixed price to charge for the product. Uncheck this section if
								the product is free or a variable price.
							</span>
						</div>
						{/* {step === OnboardingStep.Playground && product && (
							<div className="col-span-1">
								<FormLabel>Description</FormLabel>
								<LongInput
									placeholder="eg. This product includes 100 credits"
									value={(product).description || ""}
									onChange={(e) =>
										setProduct({
											...product,
											description: e.target.value,
										})
									}
								/>
							</div>
						)} */}
					</div>
				</div>
			</SheetSection>

			<BasePriceSection withSeparator={false} />
		</>
	);
};
