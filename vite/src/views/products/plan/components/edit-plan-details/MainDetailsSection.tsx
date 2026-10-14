import { FormLabel, Input } from "@autumn/ui";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { PlanIdField } from "./PlanIdField";

export const MainDetailsSection = () => {
	const { product, setProduct } = useProduct();

	return (
		<SheetSection>
			<div className="space-y-4">
				<div className="grid grid-cols-2 gap-2">
					<div>
						<FormLabel>Name</FormLabel>
						<Input
							placeholder="eg. Pro"
							value={product.name}
							onChange={(e) => setProduct({ ...product, name: e.target.value })}
						/>
					</div>
					<PlanIdField />
				</div>
			</div>
		</SheetSection>
	);
};
