import {
	PanelButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import {
	GiftIcon,
	InfoIcon,
	LightningIcon,
	PercentIcon,
} from "@phosphor-icons/react";
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
	/** Set when editing a reward that is already a free product, so it stays reselectable */
	showFreeProduct?: boolean;
}

export function SelectRewardType({
	reward,
	setReward,
	showFreeProduct = false,
}: SelectRewardTypeProps) {
	return (
		<SheetSection title="Reward Type">
			<div className="space-y-4">
				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={
							reward.rewardCategory === FrontendRewardCategory.Discount
						}
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

				{showFreeProduct && (
					<div className="flex w-full items-center gap-4">
						<PanelButton
							isSelected={
								reward.rewardCategory === FrontendRewardCategory.FreeProduct
							}
							onClick={() =>
								setReward({
									...reward,
									rewardCategory: FrontendRewardCategory.FreeProduct,
									discountType: null,
									discount_config: null,
									free_product_id: null,
									free_product_config: null,
									featureGrantEntitlements: [],
								})
							}
							icon={<GiftIcon size={16} color="currentColor" />}
						/>
						<div className="flex-1">
							<div className="mb-1 flex items-center gap-1.5">
								<span className="text-body-highlight">Free Product</span>
								<Tooltip>
									<TooltipTrigger asChild>
										<InfoIcon className="size-3.5 cursor-help text-tertiary-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										Free products are deprecated. We recommend using feature
										grants instead
									</TooltipContent>
								</Tooltip>
							</div>
							<div className="text-body-secondary leading-tight">
								Give away a plan in a referral program
							</div>
						</div>
					</div>
				)}

				<div className="flex w-full items-center gap-4">
					<PanelButton
						isSelected={
							reward.rewardCategory === FrontendRewardCategory.FeatureGrant
						}
						onClick={() =>
							setReward({
								...reward,
								rewardCategory: FrontendRewardCategory.FeatureGrant,
								discountType: null,
								discount_config: null,
								free_product_id: null,
								free_product_config: null,
								featureGrantEntitlements: [{ feature_id: "" }],
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
