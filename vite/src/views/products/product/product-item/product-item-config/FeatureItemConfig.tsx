import { BillingInterval, FeatureUsageType, Infinite } from "@autumn/shared";
import React from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { notNullish } from "@/utils/genUtils";
import {
	getFeature,
	getFeatureUsageType,
} from "@/utils/product/entitlementUtils";
import { isFeatureItem, isFeaturePriceItem } from "@/utils/product/getItemType";
import { useProductItemContext } from "../ProductItemContext";
import FeaturePrice from "./components/feature-price/FeaturePrice";
import { SelectCycle } from "./components/feature-price/SelectBillingCycle";
import { IncludedUsage } from "./components/IncludedUsage";
import { SelectResetCycle } from "./components/SelectResetCycle";

export const FeatureConfig = () => {
	const { features } = useFeaturesQuery();
	const { item, setItem } = useProductItemContext();

	if (!item.feature_id) return null;

	const isFeaturePrice = isFeaturePriceItem(item);
	const isFeature = isFeatureItem(item);

	const handleAddUsagePrice = () => {
		const newIncludedUsage =
			item.included_usage == Infinite ? 0 : item.included_usage;

		let newInterval = item.interval;
		if (
			notNullish(item.interval) &&
			!Object.values(BillingInterval).includes(item.interval)
		) {
			newInterval = BillingInterval.Month;
		}

		setItem({
			...item,
			included_usage: newIncludedUsage,
			tiers: [{ to: Infinite, amount: 0 }],
			interval: newInterval,
		});
	};

	const price =
		getFeatureUsageType({ item, features }) == FeatureUsageType.ContinuousUse
			? "10"
			: "1";

	const feature = getFeature(item?.feature_id, features);

	return (
		<>
			{isFeature && (
				<div className="flex items-center gap-2 w-full">
					<IncludedUsage />
					<SelectResetCycle />
				</div>
			)}

			{isFeaturePrice && (
				<React.Fragment>
					<div className="transition-all duration-300 ease-in-out whitespace-nowrap">
						<div className="flex gap-6 flex-2">
							<FeaturePrice />
						</div>
					</div>

					<div className="flex gap-2">
						<SelectCycle />
					</div>
				</React.Fragment>
			)}
		</>
	);
};
