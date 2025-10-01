import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import { LongInput } from "@/components/v2/inputs/LongInput";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useAutoSlug } from "@/hooks/common/useAutoSlug";
import { useProductContext } from "@/views/products/product/ProductContext";
import { BasePriceSection } from "../../products/plan/components/edit-plan-details/BasePriceSection";

export const PlanDetailsStep = () => {
	const { product, setProduct } = useProductContext();
	const { setSource, setTarget } = useAutoSlug({
		state: product,
		setState: setProduct,
		sourceKey: "name",
		targetKey: "id",
	});

	return (
		<>
			<SheetSection title="Plan Details">
				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-2">
						<div>
							<FormLabel>Name</FormLabel>
							<Input
								placeholder="eg. Pro Plan"
								value={product?.name || ""}
								onChange={(e) => setSource(e.target.value)}
							/>
						</div>
						<div>
							<FormLabel>ID</FormLabel>
							<Input
								placeholder="eg. pro_plan"
								value={product?.id || ""}
								onChange={(e) => setTarget(e.target.value)}
							/>
						</div>
						<div className="col-span-2">
							<FormLabel>Description</FormLabel>
							<LongInput
								placeholder="eg. This plan includes 100 credits"
								value={product?.description || ""}
								onChange={(e) =>
									setProduct({
										...product,
										description: e.target.value,
									})
								}
							/>
						</div>
					</div>
				</div>
			</SheetSection>

			<BasePriceSection />
		</>
	);
};
