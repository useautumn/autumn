import { useProductContext } from "@/views/products/product/ProductContext";
import { useProductItemContext } from "../../ProductItemContext";
import { useState } from "react";
import { ChevronRight, PlusIcon } from "lucide-react";
import { ToggleButton } from "@/components/general/ToggleButton";
import { OnDecreaseSelect } from "./proration-config/OnDecreaseSelect";
import { OnIncreaseSelect } from "./proration-config/OnIncreaseSelect";
import { shouldShowProrationConfig } from "@/utils/product/productItemUtils";
import {
	getFeature,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { FeatureUsageType, ProductItemInterval } from "@autumn/shared";
import { Input } from "@/components/ui/input";

export const AdvancedItemConfig = () => {
	const { features } = useProductContext();
	const { item, setItem } = useProductItemContext();
  console.log("item", item);
	const [isOpen, setIsOpen] = useState(item.usage_limit != null);

	const showProrationConfig = shouldShowProrationConfig({ item, features });
	const usageType = getFeatureUsageType({ item, features });

	return (
		<div className="w-full h-fit">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1 w-fit rounded-md text-t3 hover:text-zinc-800 transition-all duration-150 ease-out mt-1"
			>
				<ChevronRight
					className={`w-4 h-4 transition-transform duration-150 ease-out ${
						isOpen ? "rotate-90" : "rotate-0"
					}`}
				/>
				<span className="text-sm font-medium">Advanced</span>
			</button>

			<div
				className={`overflow-hidden transition-all duration-150 ease-out ${
					isOpen ? "max-h-72 opacity-100 mt-2" : "max-h-0 opacity-0"
				}`}
			>
				<div className="flex flex-col gap-4 p-4 bg-stone-100">
					<ToggleButton
						value={item.reset_usage_when_enabled}
						setValue={() => {
							setItem({
								...item,
								reset_usage_when_enabled:
									!item.reset_usage_when_enabled,
							});
						}}
						infoContent="A customer has used 20/100 credits on a free plan. Then they upgrade to a Pro plan with 500 credits. If this flag is enabled, they’ll get 500 credits on upgrade. If false, they’ll have 480."
						buttonText="Reset existing usage when product is enabled"
						className="text-t3 h-fit"
						disabled={usageType === FeatureUsageType.Continuous}
					/>

					<div className="relative flex flex-row items-center gap-3 min-h-[35px]">
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
										usage_limit: parseInt(e.target.value),
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

					<div className="relative flex flex-row items-center gap-3 min-h-[35px]">
						<ToggleButton
							value={item.config?.rollover != null}
							setValue={() => {
								if (item.config?.rollover != null) {
									setItem({
										...item,
										config: {
											...item.config,
											rollover: null,
										},
									});
								} else {
									setItem({
										...item,
										config: {
											...item.config,
											rollover: {
												duration: ProductItemInterval.Month,
											},
										},
									});
								}
							}}
							buttonText="Enable rollovers"
							infoContent="Rollovers allow unused credits to carry forward to the next billing cycle. For example: if a customer uses 80 out of 100 credits, they'll start the next cycle with 120 credits (100 new + 20 unused). You can set a maximum rollover amount to cap how many credits can accumulate, and specify how many billing cycles the rollover continues before resetting to the base amount."
							className="text-t3 h-fit"
						/>

						{item.config?.rollover != null && (
							<div className="flex flex-row items-center gap-3 w-full">
                <Input
                  type="number"
                  value={item.config.rollover.max || ""}
                  className="ml-5 w-full"
                  placeholder="Max amount"
                  onChange={(e) => {
                    setItem({
                      ...item,
                      config: {
                        ...item.config,
                        rollover: { 
                          ...item.config!.rollover!, 
                          max: parseInt(e.target.value) 
                        },
                      },
                    });
                  }}
                />


								<Input
									type="number"
									value={item.config.rollover.length || ""}
                  onChange={(e) => {
                    setItem({
                      ...item,
                      config: {
                        ...item.config,
                        rollover: { 
                          ...item.config!.rollover!, 
                          length: parseInt(e.target.value) 
                        },
                      },
                    });
                  }}
									className="ml-0 w-full"
									endContent={
										<>
											<p className="text-sm">month(s)</p>
										</>
									}
								/>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
