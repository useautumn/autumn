import { FeatureUsageType } from "@autumn/shared";
import { useState } from "react";
import { ToggleButton } from "@/components/general/ToggleButton";
import { Input } from "@/components/ui/input";
import { notNullish } from "@/utils/genUtils";
import {
	getFeatureCreditSystem,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { shouldShowProrationConfig } from "@/utils/product/productItemUtils";
import { useProductContext } from "@/views/products/product/ProductContext";
import { useProductItemContext } from "../../ProductItemContext";
import { OnDecreaseSelect } from "./proration-config/OnDecreaseSelect";
import { OnIncreaseSelect } from "./proration-config/OnIncreaseSelect";
import { RolloverConfigView } from "./RolloverConfig";

export const AdvancedItemConfig = () => {
	const { features } = useProductContext();
	const { item, setItem } = useProductItemContext();

	const [_isOpen, _setIsOpen] = useState(item.usage_limit != null);

	const showProrationConfig = shouldShowProrationConfig({ item, features });

	const usageType = getFeatureUsageType({ item, features });
	const hasCreditSystem = getFeatureCreditSystem({ item, features });
	const showRolloverConfig =
		(hasCreditSystem || usageType === FeatureUsageType.Single) &&
		item.interval !== null &&
		item.included_usage > 0;

	return (
		<div className="w-full p-6 h-full">
			<p className="text-t2 text-sm font-medium mb-6">Advanced</p>
			<div
				className={`overflow-hidden transition-all duration-150 ease-out h-full`}
			>
				<div className="flex flex-col gap-4 text-sm">
					<ToggleButton
						value={item.reset_usage_when_enabled}
						setValue={() => {
							setItem({
								...item,
								reset_usage_when_enabled: !item.reset_usage_when_enabled,
							});
						}}
						infoContent="A customer has used 20/100 credits on a free plan. Then they upgrade to a Pro plan with 500 credits. If this flag is enabled, they'll get 500 credits on upgrade. If false, they'll have 480."
						buttonText={
							<span className="whitespace-normal text-left leading-relaxed">
								Reset existing usage when product is enabled
							</span>
						}
						className="text-t3 h-fit items-start gap-1"
						disabled={
							usageType === FeatureUsageType.Continuous ||
							notNullish(item.config?.rollover)
						}
						switchClassName="mt-[3px]"
					/>

					<div className="h-4.5 relative flex flex-row items-center gap-3">
						<ToggleButton
							value={item.usage_limit != null}
							setValue={() => {
								let usage_limit;
								if (item.usage_limit) {
									usage_limit = null;
								} else {
									usage_limit = Infinity;
								}
								setItem({
									...item,
									usage_limit: usage_limit,
								});
							}}
							buttonText="Enable usage limits"
							className="text-t3 h-fit"
						/>

						{item.usage_limit != null && (
							<Input
								type="number"
								value={item.usage_limit || ""}
								className="ml-5 w-25"
								onChange={(e) => {
									setItem({
										...item,
										usage_limit: parseInt(e.target.value, 10),
									});
								}}
								placeholder="eg. 100"
							/>
						)}
					</div>

					{showProrationConfig && (
						<>
							<OnIncreaseSelect />
							<OnDecreaseSelect />
						</>
					)}
					{/* <div className="flex flex-col gap-2"></div>
          <div className="flex gap-2"></div> */}

					{showRolloverConfig && (
						<RolloverConfigView
							item={item}
							setItem={setItem}
							showRolloverConfig={showRolloverConfig}
						/>
					)}
				</div>
			</div>
		</div>
	);
};
