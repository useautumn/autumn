import { type FreeTrial, notNullish } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { getDefaultFreeTrial } from "../../utils/getDefaultFreeTrial";
import { FreeTrialSection } from "./FreeTrialSection";

export const AdditionalOptions = ({
	withSeparator = false,
}: {
	withSeparator?: boolean;
}) => {
	const { product, setProduct } = useProduct();

	if (!product.planType) return null;

	return (
		<SheetSection withSeparator={withSeparator}>
			<div className="space-y-4">
				{((product.planType === "free" && !product.is_add_on) ||
					product.free_trial?.card_required === false) && (
					<AreaCheckbox
						title="Auto-enable Plan"
						description="This plan will be enabled automatically for new customers"
						checked={product.is_default}
						disabled={product.is_add_on}
						onCheckedChange={(checked) =>
							setProduct({ ...product, is_default: checked })
						}
					/>
				)}
				<AreaCheckbox
					title={
						product.planType === "free" ? "Limited-time Trial" : "Free Trial"
					}
					checked={notNullish(product.free_trial)}
					onCheckedChange={(checked) =>
						setProduct({
							...product,
							free_trial: checked ? (getDefaultFreeTrial() as FreeTrial) : null,
						})
					}
					description="Enable a free trial period for customers to try this plan "
				>
					{notNullish(product.free_trial) && <FreeTrialSection />}
				</AreaCheckbox>
			</div>
		</SheetSection>
	);
};
