import type { FrontendProduct, PlanLicense, ProductV2 } from "@autumn/shared";
import { useSheet } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
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
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	onSave: (product: FrontendProduct) => Promise<boolean>;
}) {
	const { sheetType } = useSheet();
	const globalSheetOpen = useSheetStore((s) => s.type !== null);
	const anyLicenseSheetOpen = useIsLicenseSheetOpen();
	useLicensePlanCardLifecycle({ planLicense, license, onSave });

	// This license is the active editor when its own sheet is open. When some
	// other editor's sheet is open (the parent plan, or a sibling license), dim
	// this card to match — that editor's overlay can't reach it across contexts.
	const isActiveEditor = sheetType !== null;
	const isOtherSheetOpen =
		!isActiveEditor && (globalSheetOpen || anyLicenseSheetOpen);

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
