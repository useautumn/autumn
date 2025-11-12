import {
	type FreeTrial,
	notNullish,
	productV2ToBasePrice,
} from "@autumn/shared";
import { AreaCheckbox } from "@/components/v2/checkboxes/AreaCheckbox";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useProductStore } from "@/hooks/stores/useProductStore";
import { getDefaultFreeTrial } from "../../utils/getDefaultFreeTrial";
import { FreeTrialSection } from "./FreeTrialSection";

export const AdditionalOptions = ({
	withSeparator = false,
	hideAddOn = false,
}: {
	withSeparator?: boolean;
	hideAddOn?: boolean;
}) => {
	const product = useProductStore((s) => s.product);
	const setProduct = useProductStore((s) => s.setProduct);

	const basePrice = productV2ToBasePrice({ product });

	const hasGroup = notNullish(product.group);

	if (!product.planType) return null;
	if (
		product.planType === "paid" &&
		!basePrice?.amount &&
		product.basePriceType !== "usage"
	)
		return null;

	return (
		<SheetSection title="Additional Options" withSeparator={withSeparator}>
			<div className="space-y-4">
				{(product.planType === "free" ||
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
				{(product.planType === "paid" || !hideAddOn) && (
					<AreaCheckbox
						title="Add-on Plan"
						description="This plan can be bought together with
                        base plans (eg, top ups)"
						checked={product.is_add_on}
						disabled={product.is_default}
						onCheckedChange={(checked) =>
							setProduct({ ...product, is_add_on: checked })
						}
					/>
				)}
				{/* <div className="space-y-2">
					<AreaCheckbox
						title="Group"
						description="If your app has multiple groups of subscription tiers, you can choose which group this plan belongs to."
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
				</div> */}
			</div>
		</SheetSection>
	);
};
