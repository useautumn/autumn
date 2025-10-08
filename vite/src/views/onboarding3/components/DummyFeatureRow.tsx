import type { CreateFeature } from "@autumn/shared";
import {
	FeatureType,
	type ProductItem,
	ProductItemFeatureType,
} from "@autumn/shared";
import { PlanFeatureIcon } from "@/views/products/plan/components/PlanCard/PlanFeatureIcon";

// Custom dot component with bigger height but smaller width
const CustomDotIcon = () => {
	return <div className="w-[2px] h-[2px] mx-0.5 bg-current rounded-full" />;
};

interface DummyFeatureRowProps {
	feature: CreateFeature;
}

export const DummyFeatureRow = ({ feature }: DummyFeatureRowProps) => {
	// Map FeatureType to ProductItemFeatureType for icon display
	const getFeatureTypeForIcon = (
		featureType: FeatureType | null,
	): ProductItemFeatureType => {
		if (featureType === FeatureType.Boolean) {
			return ProductItemFeatureType.Boolean;
		}
		if (featureType === FeatureType.Metered) {
			return ProductItemFeatureType.SingleUse;
		}
		// Default to SingleUse for other types
		return ProductItemFeatureType.SingleUse;
	};

	// Create a mock ProductItem for PlanFeatureIcon
	const mockItem: ProductItem = {
		feature_id: feature.id || "",
		feature_type: getFeatureTypeForIcon(feature.type),
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
