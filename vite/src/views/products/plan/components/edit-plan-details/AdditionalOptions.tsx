import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { Input } from "@/components/v2/inputs/Input";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const AdditionalOptions = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const hasGroup = product.group !== null;

	return (
		<SheetSection title="Additional Options" withSeparator={withSeparator}>
			<div className="space-y-4">
				<AreaCheckbox
					title="Enable By Default"
					description="This product will be enabled by default for all new users,
                        typically used for your free product"
					checked={product.is_default}
					disabled={product.is_add_on}
					onCheckedChange={(checked) =>
						setProduct({ ...product, is_default: checked })
					}
				/>
				<AreaCheckbox
					title="Add On"
					description="This plan is an add-on that can be bought together with your
                        base plans (eg, top ups)"
					checked={product.is_add_on}
					disabled={product.is_default}
					onCheckedChange={(checked) =>
						setProduct({ ...product, is_add_on: checked })
					}
				/>
				<div className="space-y-2">
					<AreaCheckbox
						title="Product Group"
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
			</div>
		</SheetSection>
	);
};
