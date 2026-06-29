import { productV2ToFrontendProduct } from "@autumn/shared";
import { useOrg } from "@/hooks/common/useOrg";
import { getBasePriceDisplay } from "@/utils/product/basePriceDisplayUtils";
import type { PlanVariant } from "@/services/products/ProductService";

export function VariantPrice({ variant }: { variant: PlanVariant }) {
	const { org } = useOrg();

	if (!variant.product) return null;

	const product = productV2ToFrontendProduct({ product: variant.product });
	const priceDisplay = getBasePriceDisplay({
		product,
		currency: org?.default_currency,
	});

	if (priceDisplay.type !== "price") {
		return (
			<div className="text-sm text-tertiary-foreground">
				{priceDisplay.displayText}
			</div>
		);
	}

	return (
		<div className="inline-flex items-baseline gap-1 text-body-secondary">
			<span className="text-lg font-semibold text-muted-foreground">
				{priceDisplay.formattedAmount}
			</span>
			<span>{priceDisplay.intervalText}</span>
		</div>
	);
}
