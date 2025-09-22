import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Feature, FeatureType, FeatureUsageType } from "@autumn/shared";

interface FeatureTypeBadgeProps {
	type: string | undefined;
}

export function FeatureTypeBadge(feature: Feature) {
	const badgeType =
		feature.type == FeatureType.Boolean
			? "boolean"
			: feature.config?.usage_type === FeatureUsageType.Continuous
				? "continuous use"
				: "single use";

	return (
		<Badge
			className={cn(
				"bg-transparent border border-t1 text-t1 rounded-md px-2 pointer-events-none",
				badgeType === "boolean" && "bg-lime-50 text-lime-600 border-lime-600",
				badgeType === "continuous use" &&
					"bg-cyan-50 text-cyan-600 border-cyan-600",
				badgeType === "single use" &&
					"bg-blue-50 text-blue-600 border-blue-600",
			)}
		>
			{badgeType}
		</Badge>
	);
}
