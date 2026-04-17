import { LightningIcon, PercentIcon } from "@phosphor-icons/react";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	FrontendDiscountType,
	type FrontendReward,
	FrontendRewardCategory,
} from "../../types/frontendReward";
import { defaultDiscountConfig } from "../../utils/defaultRewardModels";

interface SelectRewardTypeProps {
	reward: FrontendReward;
	setReward: (reward: FrontendReward) => void;
}

export function SelectRewardType({ reward, setReward }: SelectRewardTypeProps) {
	return (
		<SheetSection title="Reward Type">
			<div className="space-y-4">
				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={reward.rewardCategory === "discount"}
						onClick={() =>
							setReward({
								...reward,
								rewardCategory: FrontendRewardCategory.Discount,
								discountType: FrontendDiscountType.Percentage,
								discount_config: defaultDiscountConfig,
								free_product_id: null,
								free_product_config: null,
								featureGrantEntitlements: [],
							})
						}
						icon={<PercentIcon size={16} color="currentColor" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">Discount</div>
						<div className="text-body-secondary leading-tight">
							Give your users a percentage or fixed price coupon when attaching
							a reward
						</div>
					</div>
				</div>

				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={reward.rewardCategory === "feature_grant"}
						onClick={() =>
							setReward({
								...reward,
								rewardCategory: FrontendRewardCategory.FeatureGrant,
								discountType: null,
								discount_config: null,
								free_product_id: null,
								free_product_config: null,
								featureGrantEntitlements: [{ feature_id: "", allowance: 0 }],
							})
						}
						icon={<LightningIcon size={16} color="currentColor" />}
					/>
					<div className="flex-1">
						<div className="text-body-highlight mb-1">Feature Grant</div>
						<div className="text-body-secondary leading-tight">
							Give your users a metered feature balance grant upon promo code
							redemption
						</div>
					</div>
				</div>
			</div>
		</SheetSection>
	);
}
