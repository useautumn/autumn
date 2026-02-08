import { type FreeTrial, notNullish } from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
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
				{(product.planType === "free" ||
					product.free_trial?.card_required === false) && (
					<AreaCheckbox
						title="Auto-enable plan"
						description="This plan will be enabled automatically for new customers"
						checked={product.is_default}
						disabledReason={
							product.is_add_on
								? "Cannot auto-enable an add-on plan"
								: undefined
						}
						onCheckedChange={(checked) =>
							setProduct({ ...product, is_default: checked })
						}
					/>
				)}
				<AreaCheckbox
					title={
						product.planType === "free" ? "Limited-time trial" : "Free trial"
					}
					checked={notNullish(product.free_trial)}
					disabledReason={
						product.planType !== "free" &&
						!product.items.some((item) => item.interval)
							? "Add a recurring price to add a free trial"
							: undefined
					}
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
				<AreaCheckbox
					title="Add-on plan"
					description="This plan can be purchased alongside base plans as an add-on"
					checked={product.is_add_on}
					disabledReason={
						product.is_default
							? "Cannot mark as add-on while auto-enable is active"
							: product.planType !== "free" &&
									!product.items.some((item) => item.interval)
								? "Add a recurring price to this plan before marking it as an add-on."
								: undefined
					}
					onCheckedChange={(checked) =>
						setProduct({
							...product,
							is_add_on: checked,
							is_default: checked ? false : product.is_default,
						})
					}
				/>
			</div>
		</SheetSection>
	);
};
