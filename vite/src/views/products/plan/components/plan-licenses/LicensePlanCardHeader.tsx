import {
	type PlanLicense,
	type ProductV2,
	productV2ToBasePrice,
} from "@autumn/shared";
import {
	CardHeader,
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { ArrowRightIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import {
	useCurrentItem,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { checkItemIsValid, getFeature } from "@/utils/product/entitlementUtils";
import { BasePriceDisplay } from "../plan-card/BasePriceDisplay";
import { useLicenseDraft } from "./useLicenseDraftStore";

/**
 * Compact header for a license card: identity, link config (included quantity,
 * pooling), and actions in one row — slimmer than the plan card's header so the
 * card reads as a child of the plan.
 */
export function LicensePlanCardHeader({
	planLicense,
	license,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
}) {
	const navigate = useNavigate();
	const { product } = useProduct();
	const { sheetType, setSheet } = useSheet();
	const { features } = useFeaturesQuery();
	const item = useCurrentItem();

	const included =
		useLicenseDraft(license.id)?.included ?? planLicense.included;
	const isEditingSettings = sheetType === "edit-plan";
	const hasBasePrice = Boolean(productV2ToBasePrice({ product }));

	const openSettings = () => {
		if (item && !checkItemIsValid(item)) return;
		setSheet({ type: "edit-plan", itemId: product.id });
	};

	return (
		<CardHeader className="px-3">
			<div className="flex items-center justify-between w-full gap-2">
				<div className="flex items-center gap-2 text-xs min-w-0">
					<Tooltip>
						<TooltipTrigger
							onClick={openSettings}
							className="shrink-0 flex h-5 min-w-5 cursor-pointer items-center justify-center rounded-md border border-border bg-secondary px-1 font-medium tabular-nums transition-colors hover:bg-accent hover:text-foreground"
						>
							{included}
						</TooltipTrigger>
						<TooltipContent>Included quantity</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger className="font-medium truncate">
							{license.name ?? license.id}
						</TooltipTrigger>
						<TooltipContent>
							Editing this license for this plan only — the base license is
							unchanged
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					{hasBasePrice && <BasePriceDisplay product={product} compact />}
					<IconButton
						aria-label="License Settings"
						icon={<PencilSimpleIcon />}
						iconOrientation="center"
						onClick={openSettings}
						size="mini"
						variant="secondary"
						className={cn(isEditingSettings && "btn-secondary-active")}
					/>
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
			</div>
		</CardHeader>
	);
}
