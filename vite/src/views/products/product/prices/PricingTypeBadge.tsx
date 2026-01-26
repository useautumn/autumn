import { PriceType } from "@autumn/shared";
import { Badge } from "@/components/ui/badge";

interface PricingTypeBadgeProps {
	type: string;
}

export function PricingTypeBadge({ type }: PricingTypeBadgeProps) {
	const variant = type === PriceType.Fixed ? "purple" : "blue";

	return <Badge variant={variant}>{type}</Badge>;
}
