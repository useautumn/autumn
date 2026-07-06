import type {
	CustomizePlanLicense,
	FrontendProduct,
	PlanLicense,
	ProductV2,
} from "@autumn/shared";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { LicensePlanCardChrome } from "./LicensePlanCardChrome";
import {
	LICENSE_CARD_ACTIVE_CLASS,
	LicenseCardDim,
	LicenseSheetPortal,
} from "./LicenseSheetPortal";
import { useLicensePlanCardLifecycle } from "./useLicensePlanCardLifecycle";
import { useIsLicenseSheetOpen } from "./useLicenseSheetStore";

export function LicensePlanCardEditor({
	planLicense,
	license,
	onSave,
	buildCustomize,
	isPendingLink,
	isParentSheetOpen,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	onSave: ({
		product,
		itemsChanged,
	}: {
		product: FrontendProduct;
		itemsChanged: boolean;
	}) => Promise<boolean>;
	buildCustomize: ({
		product,
		itemsChanged,
	}: {
		product: FrontendProduct;
		itemsChanged: boolean;
	}) => CustomizePlanLicense;
	isPendingLink: boolean;
	isParentSheetOpen: boolean;
}) {
	const { sheetType } = useSheet();
	const anyLicenseSheetOpen = useIsLicenseSheetOpen();
	useLicensePlanCardLifecycle({
		planLicense,
		license,
		onSave,
		buildCustomize,
		isPendingLink,
	});

	// This license is the active editor when its own sheet is open. When some
	// other editor's sheet is open (the parent plan, or a sibling license), dim
	// this card to match — that editor's overlay can't reach it across contexts.
	const isActiveEditor = sheetType !== null;
	const isOtherSheetOpen =
		!isActiveEditor && (isParentSheetOpen || anyLicenseSheetOpen);

	return (
		<div
			className={cn(
				"relative w-full flex flex-col items-center gap-2",
				isActiveEditor && LICENSE_CARD_ACTIVE_CLASS,
			)}
		>
			<LicensePlanCardChrome planLicense={planLicense} license={license} />
			<div className="relative w-full flex justify-center">
				<PlanCard />
				<LicenseCardDim show={isOtherSheetOpen} />
			</div>

			<LicenseSheetPortal />
		</div>
	);
}
