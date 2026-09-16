import type { Feature } from "@autumn/shared";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import {
	getFeatureIcon,
	getFeatureIconConfig,
} from "@/views/products/features/utils/getFeatureIcon";
import { catalogCardClassName, featurePagePath } from "./catalogUi";

export function FeatureChip({ feature }: { feature: Feature }) {
	const config = getFeatureIconConfig(feature.type, feature.config?.usage_type);

	return (
		<Link
			to={featurePagePath({ featureId: feature.id })}
			title={config.label}
			className={cn(
				"flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1",
				catalogCardClassName,
			)}
		>
			{getFeatureIcon({ feature, size: 12 })}
			<span className="truncate text-tiny text-foreground">{feature.name}</span>
		</Link>
	);
}
