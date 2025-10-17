import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";

export const AdditionalOptions = ({
	withSeparator = true,
}: {
	withSeparator?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	return (
		<SheetSection title="Additional Options" withSeparator={withSeparator}>
			<div className="space-y-4">
				<AreaCheckbox
					title="Enable by default"
					description="This plan will be enabled by default for all new users,
                        typically used for your free plan"
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
			</div>
		</SheetSection>
	);
};
