import type { CreateFeature } from "@autumn/shared";
import {
	FeatureType,
	type ProductItem,
	ProductItemFeatureType,
} from "@autumn/shared";
import { PlanFeatureIcon } from "@/views/products/plan/components/plan-card/PlanFeatureIcon";

// Custom dot component with bigger height but smaller width
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface DummyFeatureRowProps {
	feature: CreateFeature;
}

export const DummyFeatureRow = ({ feature }: DummyFeatureRowProps) => {
	// Map FeatureType to ProductItemFeatureType for icon display
	// Using the same logic as getItemFeatureType from shared utils
	const getFeatureTypeForIcon = (
		feature: CreateFeature,
	): ProductItemFeatureType => {
		if (feature.type === FeatureType.Boolean) {
			return ProductItemFeatureType.Static;
		}
		if (feature.type === FeatureType.CreditSystem) {
			return ProductItemFeatureType.SingleUse;
		}
		// For Metered features, use the config's usage_type if available
		if (feature.type === FeatureType.Metered && feature.config?.usage_type) {
			return feature.config.usage_type as ProductItemFeatureType;
		}
		// Default to SingleUse
		return ProductItemFeatureType.SingleUse;
	};

	// Create a mock ProductItem for PlanFeatureIcon
	const mockItem: ProductItem = {
		feature_id: feature.id || "",
		feature_type: getFeatureTypeForIcon(feature),
		included_usage: null,
		interval: null,
		price: null,
		tiers: null,
		billing_units: null,
		entity_feature_id: null,
		reset_usage_when_enabled: null,
	};

	const displayText = feature.name || "Feature name";

	return (
		<div className="flex w-full !h-9 input-base input-shadow-tiny select-bg select-none pointer-events-none">
			{/* Left side - Icons and text */}
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 relative">
				<div className="flex flex-row items-center flex-shrink-0">
					<PlanFeatureIcon item={mockItem} position="left" />
				</div>

				<div className="flex items-center gap-2 flex-1 min-w-0 max-w-[90%]">
					<p className="whitespace-nowrap truncate max-w-full">
						<span className="text-body">{displayText}</span>
					</p>
				</div>
			</div>
		</div>
	);
};
