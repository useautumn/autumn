import type { PlanLicense, ProductV2 } from "@autumn/shared";
import {
	Button,
	CardHeader,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	IconButton,
} from "@autumn/ui";
import {
	ArrowRightIcon,
	PencilSimpleIcon,
	TrashIcon,
} from "@phosphor-icons/react";
import { EllipsisVerticalIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { AdminHover } from "@/components/general/AdminHover";
import {
	useCurrentItem,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { checkItemIsValid } from "@/utils/product/entitlementUtils";
import { usePendingLicenseLinks } from "./PendingLicenseLinksContext";
import { useLicenseDraft, useLicenseDraftStore } from "./useLicenseDraftStore";

/** Staged removals stay mounted so their edited configuration survives until save. */
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
	const { setSheet } = useSheet();
	const item = useCurrentItem();
	const patchDraft = useLicenseDraftStore((s) => s.patch);
	const { removePendingLink } = usePendingLicenseLinks();
	const [menuOpen, setMenuOpen] = useState(false);

	const draft = useLicenseDraft(license.id);
	const removed = draft?.removed ?? false;
	const licenseName = (
		<AdminHover
			hide={isPendingLink}
			side="top"
			texts={[
				license.internal_id
					? {
							key: "internal_product_id",
							value: license.internal_id,
						}
					: undefined,
				{ key: "version", value: license.version.toString() },
			]}
			triggerClassName="min-w-0 max-w-full"
		>
			<span
				className={cn(
					"font-medium truncate",
					removed && "line-through text-tertiary-foreground",
				)}
			>
				{license.name ?? license.id}
			</span>
		</AdminHover>
	);

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
				<div className="flex items-center justify-between w-full gap-2 min-w-0">
					<div className="flex items-center gap-2 text-xs min-w-0">
						{licenseName}
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
			<div className="flex items-center justify-between w-full gap-2 min-w-0">
				<div className="flex items-center gap-2 text-xs min-w-0">
					{licenseName}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>
							<IconButton
								aria-label={`${license.name ?? license.id} actions`}
								icon={<EllipsisVerticalIcon />}
								iconOrientation="center"
								size="mini"
								variant="secondary"
								className={cn(menuOpen && "btn-secondary-active")}
							/>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								className="flex items-center text-xs"
								onClick={() => openSettings()}
							>
								<div className="flex items-center gap-2">
									<PencilSimpleIcon
										size={12}
										className="text-tertiary-foreground"
									/>
									License Settings
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="flex items-center text-xs"
								onClick={() =>
									pushPage({
										navigate,
										path: `/products/${license.id}`,
										queryParams: { fromPlan: planLicense.parent_plan_id },
									})
								}
							>
								<div className="flex items-center gap-2">
									<ArrowRightIcon
										size={12}
										className="text-tertiary-foreground"
									/>
									Go to License
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="flex items-center text-xs"
								onClick={() => removeCard()}
							>
								<div className="flex items-center gap-2">
									<TrashIcon size={12} className="text-tertiary-foreground" />
									Remove
								</div>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</CardHeader>
	);
}
