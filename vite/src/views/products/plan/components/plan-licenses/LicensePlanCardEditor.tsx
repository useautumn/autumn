import type {
	CustomizePlanLicense,
	PlanLicense,
	PlanLicenseParams,
	ProductV2,
} from "@autumn/shared";
import { useEffect } from "react";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { LicensePlanCardHeader } from "./LicensePlanCardHeader";
import {
	LICENSE_CARD_ACTIVE_CLASS,
	LicenseSheetPortal,
} from "./LicenseSheetPortal";
import type { LicenseEditSnapshot } from "./licenseCustomizeUtils";
import { useLicenseDraft } from "./useLicenseDraftStore";
import { useLicensePlanCardLifecycle } from "./useLicensePlanCardLifecycle";
import { useLicenseRowStore } from "./useLicenseRowStore";

export function LicensePlanCardEditor({
	planLicense,
	license,
	buildEntry,
	saveItems,
	buildCustomize,
	isPendingLink,
	isLast,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	buildEntry: () => PlanLicenseParams;
	saveItems: (snapshot: LicenseEditSnapshot) => Promise<boolean>;
	buildCustomize: (snapshot: LicenseEditSnapshot) => CustomizePlanLicense;
	isPendingLink: boolean;
	isLast: boolean;
}) {
	const { product: liveLicense } = useProduct();
	const { sheetType, setSheet } = useSheet();
	useLicensePlanCardLifecycle({
		planLicense,
		license,
		buildEntry,
		saveItems,
		buildCustomize,
		isPendingLink,
	});

	const publish = useLicenseRowStore((s) => s.publish);
	const clear = useLicenseRowStore((s) => s.clear);
	const requestedOpen = useLicenseRowStore((s) => s.openRequests[license.id]);
	const consumeOpen = useLicenseRowStore((s) => s.consumeOpen);

	// Mirror this card's live product to the parent-plan row so its price tracks
	// unsaved edits (which only exist in this card's context).
	useEffect(() => {
		publish(license.id, {
			product: liveLicense,
			isEditingPrice: sheetType === "edit-plan-price",
		});
	}, [publish, license.id, liveLicense, sheetType]);

	useEffect(() => () => clear(license.id), [clear, license.id]);

	// The parent-plan row can't reach this card's sheet state, so it signals here.
	useEffect(() => {
		if (!requestedOpen) return;
		consumeOpen(license.id);
		setSheet({ type: "edit-plan-price", itemId: license.id });
	}, [requestedOpen, consumeOpen, setSheet, license.id]);

	const removed = useLicenseDraft(license.id)?.removed ?? false;

	// This license is the active editor when its own sheet is open — lift it
	// above the page overlay. Otherwise `isolate` contains PlanCard's internal
	// z-50 so whichever overlay is active dims this card like the rest of the
	// page.
	const isActiveEditor = sheetType !== null;

	return (
		<div className="relative w-full flex flex-col items-center">
			<div className="relative w-full max-w-xl pl-12">
				{!isLast && (
					<div
						aria-hidden
						className="absolute left-6 -top-6 -bottom-6 border-l border-border"
					/>
				)}
				<div
					aria-hidden
					className="absolute left-6 -top-6 bottom-1/2 w-6 rounded-bl-xl border-b border-l border-border"
				/>
				<div
					className={cn(
						"isolate relative flex justify-center transition-[opacity,filter] duration-200 ease-out",
						removed && "opacity-50 grayscale",
						// Lift only the card above the page dim — the connector lines
						// stay beneath it so they dim with the rest of the page.
						isActiveEditor && LICENSE_CARD_ACTIVE_CLASS,
					)}
				>
					<PlanCard
						slim
						header={
							<LicensePlanCardHeader
								planLicense={planLicense}
								license={license}
								isPendingLink={isPendingLink}
							/>
						}
					/>
				</div>
			</div>

			<LicenseSheetPortal />
		</div>
	);
}
