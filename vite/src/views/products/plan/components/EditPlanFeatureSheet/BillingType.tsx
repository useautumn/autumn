import { isFeaturePriceItem } from "@autumn/shared";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import {
	CoinsIcon,
	IncludedUsageIcon,
} from "@/components/v2/icons/AutumnIcons";
import { useProductItemContext } from "@/views/products/product/product-item/ProductItemContext";

export function BillingType() {
	const { item, setItem } = useProductItemContext();

	if (!item) return null;

	// Derive billing type from item state
	const isFeaturePrice = isFeaturePriceItem(item);

	const setBillingType = (type: "included" | "priced") => {
		if (type === "included") {
			// Remove tiers to switch to included
			setItem({
				...item,
				tiers: null,
				billing_units: undefined,
				usage_model: undefined,
			});
		} else {
			// Add initial tier to switch to priced
			setItem({ ...item, tiers: [{ to: 0, amount: 0 }], billing_units: 1 });
		}
	};

	return (
		<div className="mt-3 space-y-4 billing-type-section">
			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={!isFeaturePrice}
					onClick={() => setBillingType("included")}
					icon={<IncludedUsageIcon size={18} color="none" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Included</div>
					<div className="text-body-secondary leading-tight">
						Set included usage limits with reset intervals (e.g. 100
						credits/month)
					</div>
				</div>
			</div>

			<div className="flex w-full items-center gap-4">
				<PanelButton
					isSelected={isFeaturePrice}
					onClick={() => setBillingType("priced")}
					icon={<CoinsIcon size={20} color="currentColor" />}
				/>
				<div className="flex-1">
					<div className="text-body-highlight mb-1">Priced</div>
					<div className="text-body-secondary leading-tight">
						Set usage and overage pricing (e.g. 100 credits/month, $1 extra)
					</div>
				</div>
			</div>
		</div>
	);
}
