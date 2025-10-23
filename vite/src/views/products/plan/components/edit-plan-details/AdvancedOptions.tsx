import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import {
	SheetAccordion,
	SheetAccordionItem,
} from "@/components/v2/sheets/SheetAccordion";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const AdvancedOptions = () => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const hasGroup = product.group !== null;

	return (
		<SheetAccordion withSeparator={false}>
			<SheetAccordionItem
				title="Advanced Options"
				value="advanced"
				description="Advanced configuration options for this plan"
			>
				<div className="space-y-2 pt-2">
					<AreaCheckbox
						title="Group"
						description="This plan is part of a set of plans separate from your main plans"
						checked={hasGroup}
						onCheckedChange={(checked) =>
							setProduct({ ...product, group: checked ? "" : null })
						}
					>
						{hasGroup && (
							<Input
								placeholder="Enter group name"
								value={product.group ?? undefined}
								onChange={(e) =>
									setProduct({ ...product, group: e.target.value })
								}
							/>
						)}
					</AreaCheckbox>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
};
