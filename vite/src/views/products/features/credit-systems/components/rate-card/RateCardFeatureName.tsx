import type { Feature } from "@autumn/shared";
import { cn } from "@/lib/utils";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";

export function RateCardFeatureName({
	feature,
	name,
	muted = false,
}: {
	feature?: Feature;
	name: string;
	muted?: boolean;
}) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			{feature && (
				<span className="shrink-0 text-tertiary-foreground">
					{
						getFeatureIconConfig(feature.type, feature.config?.usage_type, 14)
							.icon
					}
				</span>
			)}
			<span
				className={cn(
					"truncate text-sm",
					muted ? "text-tertiary-foreground" : "font-medium text-foreground",
				)}
			>
				{name}
			</span>
		</span>
	);
}
