import type { PlanLicense, ProductV2 } from "@autumn/shared";
import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { pushPage } from "@/utils/genUtils";
import { getFeature } from "@/utils/product/entitlementUtils";

/** Thin license-context strip above the editable card: the License marker, the
 * included quantity, and a jump to the license's own page. */
export function LicensePlanCardChrome({
	planLicense,
	license,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
}) {
	const navigate = useNavigate();
	const { features } = useFeaturesQuery();

	const pooledFeatureNames = planLicense.pooled_feature_ids.map(
		(featureId) => getFeature(featureId, features)?.name ?? featureId,
	);

	return (
		<div className="flex items-center justify-between w-full max-w-xl px-1">
			<div className="flex items-center gap-2 text-sm text-tertiary-foreground">
				<Tooltip>
					<TooltipTrigger className="flex items-center gap-1.5">
						<LicenseIcon size={14} className="text-subtle" />
						License
					</TooltipTrigger>
					<TooltipContent>
						Editing this license for this plan only — the base license is
						unchanged
					</TooltipContent>
				</Tooltip>
				<span className="text-subtle">·</span>
				<span>{planLicense.included_quantity} included</span>
				{pooledFeatureNames.length > 0 && (
					<>
						<span className="text-subtle">·</span>
						<Tooltip>
							<TooltipTrigger>
								{pooledFeatureNames.length} pooled
							</TooltipTrigger>
							<TooltipContent>
								Pooled features: {pooledFeatureNames.join(", ")}
							</TooltipContent>
						</Tooltip>
					</>
				)}
			</div>
			<IconButton
				aria-label={`Go to ${license.name ?? license.id}`}
				icon={<ArrowRightIcon size={14} />}
				iconOrientation="center"
				onClick={() =>
					pushPage({
						navigate,
						path: `/products/${license.id}`,
						queryParams: { fromPlan: planLicense.parent_plan_id },
					})
				}
				size="mini"
				variant="secondary"
			/>
		</div>
	);
}
