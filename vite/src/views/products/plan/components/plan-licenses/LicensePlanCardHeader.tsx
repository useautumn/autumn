import type { PlanLicense, ProductV2 } from "@autumn/shared";
import {
	Button,
	CardHeader,
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import {
	ArrowRightIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import {
	useCurrentItem,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";
import { useLicenseDraft, useLicenseDraftStore } from "./useLicenseDraftStore";

/**
 * Compact header for a license card: identity, link config (included quantity),
 * and actions in one row — slimmer than the plan card's header so the card
 * reads as a child of the plan. A staged removal keeps the card mounted
 * (greyed) with an Undo, so its config survives until the plan is saved.
 */
export function LicensePlanCardHeader({
	planLicense,
	license,
	isPendingLink,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	isPendingLink: boolean;
}) {
	const navigate = useNavigate();
	const { product } = useProduct();
	const { sheetType, setSheet } = useSheet();
	const item = useCurrentItem();
	const patchDraft = useLicenseDraftStore((s) => s.patch);
	const { removePendingLink } = usePendingLicenseLinks();

	const draft = useLicenseDraft(license.id);
	const included = draft?.included ?? planLicense.included;
	const removed = draft?.removed ?? false;
	const isEditingSettings = sheetType === "edit-plan";

	const openSettings = () => {
		if (item && !checkItemIsValid(item)) return;
		setSheet({ type: "edit-plan", itemId: product.id });
	};

	const removeCard = () => {
		// A staged (unsaved) link has nothing to soft-delete — drop it outright.
		if (isPendingLink) {
			removePendingLink(license.id);
			return;
		}
		patchDraft(license.id, { removed: true });
	};

	if (removed) {
		return (
			<CardHeader className="px-3">
				<div className="flex items-center justify-between w-full gap-2">
					<div className="flex items-center gap-2 text-xs min-w-0">
						<span className="font-medium truncate line-through text-tertiary-foreground">
							{license.name ?? license.id}
						</span>
						<span className="shrink-0 text-tertiary-foreground">
							Removed on save
						</span>
					</div>
					<Button
						variant="secondary"
						size="sm"
						className="shrink-0"
						onClick={() => patchDraft(license.id, { removed: false })}
					>
						Undo
					</Button>
				</div>
			</CardHeader>
		);
	}

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
					<span className="font-medium truncate">
						{license.name ?? license.id}
					</span>
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<BasePriceDisplay product={product} slim />
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
						aria-label={`Remove ${license.name ?? license.id} from this plan`}
						icon={<TrashIcon size={14} />}
						iconOrientation="center"
						onClick={removeCard}
						size="mini"
						variant="secondary"
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
